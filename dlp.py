import base64
import json
import subprocess
import re
import sys
from datetime import timedelta
from pathlib import Path
import requests
import shutil
from webview import Window


if getattr(sys, 'frozen', False):
    LOCAL_BIN_DIR = Path(sys.executable).parent
else:
    LOCAL_BIN_DIR = Path(__file__).parent

YT_DLP_BIN = ""
localPath = LOCAL_BIN_DIR / "yt-dlp.exe"
if localPath.exists():
    YT_DLP_BIN = localPath.as_posix()
else:
    YT_DLP_BIN = shutil.which("yt-dlp")
    if not YT_DLP_BIN: 
        print("\033[93mWarning: No yt-dlp executable found. Download won't work properly.\033[0m")
        YT_DLP_BIN = "yt-dlp"

FFMPEG_BIN = ""
localPath = LOCAL_BIN_DIR / "ffmpeg.exe"
if localPath.exists():
    FFMPEG_BIN = localPath.as_posix()
else:
    FFMPEG_BIN = shutil.which("ffmpeg")
    if not FFMPEG_BIN: 
        print("\033[93mWarning: No ffmpeg executable found. Download won't work properly.\033[0m")
        FFMPEG_BIN = "ffmpeg"

print(f"Using {YT_DLP_BIN} as yt-dlp")
print(f"Using {FFMPEG_BIN} as ffmpeg")


def updateUIStatus(window: Window | None, status: str) -> None:
    if window: window.evaluate_js(f"apiUpdateSearchStatus({json.dumps(status)})")
    print(status)

def updateDlp(window: Window | None=None) -> dict:
    """Checks for an update and returns a dict with {"success":True} if it goes well."""
    updateUIStatus(window, "Checking for yt-dlp updates...")
    try:
        check = subprocess.run(
            [YT_DLP_BIN, "-U"], 
            capture_output=True, 
            text=True
        )
        output = check.stdout + check.stderr

        if "yt-dlp is up to date" in output:
            updateUIStatus(window, "yt-dlp is already at the latest version.")
            return {"success": True}
        
        if "Use pip to update" in output or "installed with pip" in output:
            updateUIStatus(window, "Detected pip installation. Upgrading via pip...")
            subprocess.run(
                [sys.executable, "-m", "pip", "install", "-U", "--user", "yt-dlp"],
                check=True
            )
            updateUIStatus(window, "Successfully updated yt-dlp via pip.")
            return {"success": True}

        if "Updated yt-dlp to version" in output:
            updateUIStatus(window, "Successfully updated yt-dlp binary.")
            return {"success": True}

        return {"success": False, "error": f"Unexpected update status: {output.strip()}"}

    except subprocess.CalledProcessError as e:
        print(f"Error during update: {e}")
        return {"success": False, "error": f"Error during update: {e}"}
    except FileNotFoundError:
        print("yt-dlp is not installed or not in your PATH.")
        return {"success": False, "error": "yt-dlp is not installed or not in your PATH."}

def getYTData(url: str, downloadPath: Path | str=Path.home()/'Music', window: Window | None=None, retry: bool=True) -> dict:
    """Gets the title, duration, thumbnail data, and predicted song path of the provided URL."""
    try:
        command = [
            YT_DLP_BIN,
            "--quiet",
            "--no-playlist",
            "--skip-download",
            "--dump-json",
            '--output', '%(title)s [%(id)s].%(ext)s',
            url
        ]

        result = subprocess.run(command, capture_output=True, text=True, check=True, encoding='utf-8')
        
        info = json.loads(result.stdout)
        duration = info.get('duration', 0)
        title = info.get('title', '[No Title]')
        thumbnailUrl = info.get('thumbnail')
        
        fileName = info.get('filename')
        if fileName:
            finalFilename = (Path(downloadPath) / fileName).with_suffix('.mp3').as_posix()
        else:
            finalFilename = (Path(downloadPath) / f"{title} [{info.get('id')}].mp3").as_posix()


        response = requests.get(thumbnailUrl)
        if response.status_code == 200:
            contentType = response.headers.get('Content-Type', 'image/jpeg')
            b64Data = base64.b64encode(response.content).decode('utf-8')
            base64Src = f"data:{contentType};base64,{b64Data}"
            
            return {
                "success": True,
                "title": title,
                "duration": duration,
                "thumbnail": base64Src,
                "songPath": finalFilename
            }
        return {"success": False, "error": "Thumbnail download failed. Status code "+response.status_code}
    
    except subprocess.CalledProcessError as e:
        if retry:
            updateUIStatus(window, "yt-dlp failed. Attempting an emergency update...")
            update = updateDlp(window)
            if update["success"]:
                updateUIStatus(window, "Update successful. Retrying request...")
                return getYTData(url, downloadPath, window=window, retry=False)
            return {"success": False, "error": str(update["error"])}
            
        return {"success": False, "error": f"yt-dlp error: {e.stderr}"}
    except FileNotFoundError:
        print("yt-dlp is not installed or not in your PATH.")
        return {"success": False, "error": "yt-dlp is not installed or not in your PATH."}
    except Exception as e:
        return {"success": False, "error": str(e)}


def downloadSong(url: str, downloadPath: Path=Path.home()/'Music', window: Window | None=None, cropDownload: bool=False, start: int=0, end: int=0) -> None:
    """Downloads the url as mp3 to the designated download path. if `cropDownload` set to True, `end` must me defined."""
    cmd = [
        YT_DLP_BIN,
        url,
        '--path', str(Path(downloadPath).as_posix()),
        '--output', '%(title)s [%(id)s].%(ext)s',
        '--format', 'bestaudio/best',
        '--no-playlist',
        '--embed-thumbnail',
        '--add-metadata',
        '--newline',
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '192K'
    ]
    if cropDownload and end:
        cmd.extend([
            '--downloader', 'ffmpeg',
            '--downloader-args', 'ffmpeg:-ss ' + str(timedelta(seconds=start)) + ' -to ' + str(timedelta(seconds=end))
        ])
    if "/" in FFMPEG_BIN or "\\" in FFMPEG_BIN:
        cmd.extend(['--ffmpeg-location', FFMPEG_BIN])



    process = subprocess.Popen(
        cmd, 
        stdout=subprocess.PIPE, 
        stderr=subprocess.STDOUT,
        universal_newlines=True,
        encoding='utf-8',
        errors='ignore'
    )

    for line in process.stdout:
        percentMatch = re.search(r'(?:\s|^)(?<!overhead:\s)(100(?:\.0+)?|(?:\d|[1-9]\d)(?:\.\d+)?)(?=%(?:\s|$))', line)
        if percentMatch:
            print(f"\033[93mDL Progress: {percentMatch.group(0)}%\033[0m")
            if window: window.evaluate_js(f"apiUpdateProgress({percentMatch.group(0)})")
        
        # Catch FFmpeg time=...
        elif 'time=' in line:
            time_match = re.search(r'time=(\d+):(\d+):(\d+\.\d+)', line)
            if time_match:
                hours, mins, secs = map(float, time_match.groups())
                current_total_secs = (hours * 3600) + (mins * 60) + secs//1
                percentage = current_total_secs/(end or 1)*100
                
                print(f"\033[93mpercentage: {percentage:.2f}%")

                print(f"FFmpeg Time: {":".join(time_match.group(1, 2, 3))}\033[0m")
                if window: window.evaluate_js(f"apiUpdateProgress({percentage or 0})")
        
        elif re.search(r'^\[[a-zA-Z]{2,}\]', line):
            print(f'\033[93m{line}\033[0m')
            if window: window.evaluate_js(f"apiUpdateStatus({json.dumps(line)})")
                    

    process.wait()
    if window: window.evaluate_js("apiUpdateStatus('[Done]')")

if __name__ == "__main__":
    if(len(sys.argv) > 1):
        print(json.dumps(getYTData(sys.argv[1]), indent=4))
    else:
        print("You must pass an url.")
