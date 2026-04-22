import json
from pathlib import Path
import platform
import subprocess
import urllib
import webview
import base64
from tinytag import TinyTag
import mutagen
from mutagen.id3 import ID3, TIT2, TPE1, TALB, TDRC, TXXX, APIC, ID3NoHeaderError
from mutagen.mp4 import MP4
from mutagen.flac import FLAC
from mutagen.oggvorbis import OggVorbis
import os
import sys
from types import SimpleNamespace
import io
from PIL import Image
import dlp


def getAbsolutePath(relativePath: str) -> str:
    """Helper to find the 'src' folder whether running as script or .exe"""
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, 'src', relativePath)
    return os.path.join(os.path.abspath("."), 'src', relativePath)

class Api:
    def __init__(self):
        self.downloadPath: str = ""
        self.initQueue: list[str] = []
        self.downloadWindow: webview.Window = None
        self.metadataWindow: webview.Window = None
        self.mainWindow: webview.Window = None

    def getMP3(self, songPath: str) -> str:
        """Reads an MP3 file and returns it as a base64 encoded data URI."""
        print("getMP3: ", songPath)
        try:
            with open(songPath, "rb") as audioFile:
                b64Data = base64.b64encode(audioFile.read()).decode('utf-8')
                return f"data:audio/mp3;base64,{b64Data}"
        except Exception as e:
            print(f"\033[91mError on getMP3: {e}\033[0m")
            return ""

    def getAlbumArt(self, songPath: str) -> str:
        """Extracts the cover art from an MP3 file and returns it as a base64 encoded data URI."""
        print("getAlbumArt: ", songPath)
        try:
            tag = TinyTag.get(songPath, image=True)
            imageData = tag.get_image() 
            
            if imageData:
                b64Data = base64.b64encode(imageData).decode('utf-8')
                return f"data:image/jpeg;base64,{b64Data}"
        except Exception as e:
            print(f"\033[91mError on getAlbumArt: {e}\033[0m")
        return "./album_placeholder.png"
    
    def getAlbumArtSmall(self, songPath: str, maxDim: int=400) -> str:
        """Extracts the cover art from an MP3 file, resizes it to a specified maximum dimension, and returns it as a base64 encoded data URI."""
        print("getAlbumArtSmall: ", songPath)
        try:
            tag = TinyTag.get(songPath, image=True)
            imageData = tag.get_image() 
            if imageData:
                img = Image.open(io.BytesIO(imageData))
                if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                    background = Image.new("RGB", img.size, (255, 0, 0))
                    background.paste(img, mask=img.convert("RGBA").split()[3]) 
                    img = background
                else:
                    img = img.convert("RGB")
                img.thumbnail((maxDim, maxDim), Image.Resampling.LANCZOS)
                
                buffer = io.BytesIO()
                img.save(buffer, format="JPEG", quality=85)
                b64Data = base64.b64encode(buffer.getvalue()).decode("utf-8")
                return f"data:image/jpeg;base64,{b64Data}"
            
        except Exception as e:
            print(f"\033[91mError on getAlbumArtSmall: {e}\033[0m")
        return "./album_placeholder.png"
    
    #def getMetadataTiny(self, songPath: str) -> dict:
    #    """Reads basic metadata tags from an MP3 file and returns them as a dictionary."""
    #    print("getMetadataTiny: ", songPath)
    #    try:
    #        tag = TinyTag.get(songPath).as_dict()
    #
    #        #print("\033[32m-------------------------- tinytag --------------------------\033[0m")
    #        #for (k, v) in tag.items():
    #        #    print(f"\033[92m{k}: \033[0m")
    #        #    print(v)
    #        #    print()
    #        #print("\033[34m-------------------------- mutagen --------------------------\033[0m")
    #        #tags2 = self.getMetadata(songPath)
    #        #for (k, v) in tags2['data'].items():
    #        #    print(f"\033[94m{k}: \033[0m")
    #        #    print(v)
    #        #    print()
    #        #print("\033[33m--------------------------- dict ----------------------------\033[0m")
    #        #tags3 = self.getChangableTags(songPath)
    #        #for (k, v) in tags3.items():
    #        #    print(f"\033[93m{k}: \033[0m")
    #        #    print(v)
    #
    #        return {
    #            "success": True,
    #            "data": tag
    #        }
    #    except Exception as e:
    #        print(f"\033[91mError on getMetadataTiny: {e}\033[0m")
    #        return {"success": False, "error": str(e)}
        
    def getMetadata(self, songPath: str) -> dict:
        """Reads full ID3 tag metadata from an MP3 file and returns them as a dictionary."""
        print("getMetadata: ", songPath)
        try:
            audio = mutagen.File(songPath)
            
            audioData = {}
            for key, value in audio.items():
                if(key != "APIC:Album cover" and key != "APIC:Front Cover" and key != "covr"):
                    audioData[key] = str(value)

            return {
                "success": True,
                "data": audioData
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    
    def getPlaylistMetadata(self, playlist: list[str]) -> dict:
        """Retrieves basic metadata and small cover art for a list of song paths."""
        songsData = {}
        for fullPath in playlist:
            try:
                tags = self.getChangableTags(fullPath)
                songsData[fullPath] = {
                    "title": tags['title'],
                    "artist": tags['artist'],
                    "img": self.getAlbumArtSmall(fullPath),
                }
            except Exception as e:
                print("Error: "+ str(e))
                songsData[fullPath] = {
                    "title": "[Deleted]",
                    "artist": "[Song not found]",
                    "img": "./album_placeholder.png"
                }
        return songsData
    
    def getChangableTags(self, songPath: str) -> dict:
        tags = {
            'title': '',
            'artist': '',
            'album': '',
            'year': '',
            'purl': '',
            'description': '',
            'uslt': '',
            'missing': False
        }

        try:
            audio = mutagen.File(songPath)
        except:
            tags['title'] = "[Deleted]"
            tags['artist'] = "[No Song Found]"
            tags['missing'] = True
            return tags

        if audio is None:
            return tags

        def extract(val):
            if val is None: return ""
            if isinstance(val, list):
                return str(val[0]) if len(val) > 0 else ""
            return str(val)

        if isinstance(audio, (ID3, mutagen.mp3.MP3, mutagen.wave.WAVE)):
            id3 = audio.tags if hasattr(audio, 'tags') and audio.tags else audio
            if isinstance(id3, (ID3, mutagen.id3.ID3)):
                tags['title'] = extract(id3.get('TIT2'))
                tags['artist'] = extract(id3.get('TPE1'))
                tags['album'] = extract(id3.get('TALB'))
                tags['year'] = extract(id3.get('TDRC'))
                
                purl = id3.get('TXXX:purl') or id3.get('WXXX:purl')
                tags['purl'] = extract(getattr(purl, 'url', getattr(purl, 'text', "")))

                #desc = id3.getall('COMM')
                #tags['description'] = extract(desc[0].text if desc else id3.get('TXXX:description'))
                tags['description'] = extract(id3.get('TXXX:description'))
                
                lyrics = id3.getall('USLT')
                tags['uslt'] = extract(lyrics[0].text if lyrics else id3.get('TXXX:USLT'))

        elif isinstance(audio, (FLAC, OggVorbis)):
            tags['title'] = extract(audio.get('title'))
            tags['artist'] = extract(audio.get('artist'))
            tags['album'] = extract(audio.get('album'))
            tags['year'] = extract(audio.get('date'))
            tags['purl'] = extract(audio.get('website'))
            tags['description'] = extract(audio.get('comment'))
            tags['uslt'] = extract(audio.get('lyrics'))

        elif isinstance(audio, MP4):
            tags['title'] = extract(audio.get('\xa9nam'))
            tags['artist'] = extract(audio.get('\xa9ART'))
            tags['album'] = extract(audio.get('\xa9alb'))
            tags['year'] = extract(audio.get('\xa9day'))
            tags['purl'] = extract(audio.get('purl'))
            tags['description'] = extract(audio.get('\xa9cmt'))
            tags['uslt'] = extract(audio.get('\xa9lyr'))

        return tags
        
    def updateMetadata(self, data: dict, songPath: str) -> None:
        """Updates the ID3 metadata tags of an MP3 file with the provided dictionary data."""
        print("updateMetadata: ", songPath)
        try:
            tags = ID3(songPath)
        except ID3NoHeaderError:
            tags = ID3() # No ID3 header found, create a blank one

        if 'title' in data:
            tags.add(TIT2(encoding=3, text=data['title']))

        if 'artist' in data:
            tags.add(TPE1(encoding=3, text=data['artist']))

        if 'album' in data:
            tags.add(TALB(encoding=3, text=data['album']))

        if 'year' in data:
            tags.add(TDRC(encoding=3, text=str(data['year'])))

        if 'purl' in data:
            tags.add(TXXX(encoding=3, desc='purl', text=data['purl']))

        if 'description' in data:
            tags.add(TXXX(encoding=3, desc='description', text=data['description']))

        if 'uslt' in data:
            tags.add(TXXX(encoding=3, desc='USLT', text=data['uslt']))

        for set in data.items():
            print(set)
        tags.save(songPath)

    def updateUniversalMetadata(self, data, songPath):
        # mutagen.File automatically detects if it's MP3, FLAC, M4A, etc.
        audio = mutagen.File(songPath)
        
        if audio is None:
            return {"success": False, "error": "Unsupported file format"}

        # Define how each format maps 'title', 'artist', etc. to its internal tags
        tag_maps = {
            # MP3 (ID3) and WAV
            'ID3': {
                'title': lambda v: TIT2(encoding=3, text=v),
                'artist': lambda v: TPE1(encoding=3, text=v),
                'album': lambda v: TALB(encoding=3, text=v),
                'year': lambda v: TDRC(encoding=3, text=v),
                'purl': lambda v: TXXX(encoding=3, desc='purl', text=v), #WXXX(encoding=3, url=v))
                'description': lambda v: TXXX(encoding=3, desc='description', text=v), #COMM(encoding=3, lang='eng', desc='', text=v))
                'uslt': lambda v: TXXX(encoding=3, desc='USLT', text=v) #USLT(encoding=3, lang='eng', desc='', text=v))
            },
            # FLAC and OGG (Vorbis Comments)
            'Vorbis': {
                'title': 'title',
                'artist': 'artist',
                'album': 'album',
                'year': 'date',
                'purl': 'website', #purl
                'description': 'comment', #description
                'uslt': 'lyrics' #uslt
            },
            # M4A / MP4 (iTunes Atoms)
            'MP4': {
                'title': '\xa9nam',
                'artist': '\xa9ART',
                'album': '\xa9alb',
                'year': '\xa9day',
                'purl': 'purl', 
                'description': '\xa9cmt', #description
                'uslt': '\xa9lyr' #uslt
            }
        }


        if isinstance(audio, (FLAC, OggVorbis)):
            current_map = tag_maps['Vorbis']
            for key, value in data.items():
                if key in current_map:
                    audio[current_map[key]] = value
                    
        elif isinstance(audio, MP4):
            current_map = tag_maps['MP4']
            for key, value in data.items():
                if key in current_map:
                    audio[current_map[key]] = [str(value)] # MP4 tags usually expect a list
                    
        elif isinstance(audio, (ID3, mutagen.mp3.MP3, mutagen.wave.WAVE)):
            if audio.tags is None: audio.add_tags() # If it's an MP3, ensure we have ID3 tags initialized
            current_map = tag_maps['ID3']
            for key, value in data.items():
                if key in current_map:
                    # Call the lambda function to create the ID3 frame object
                    audio.tags.add(current_map[key](value))

        audio.save()
        

    def updateThumbnail(self, base64String: str, songPath: str) -> None:
        """Updates the album cover art of an MP3 file using a base64 encoded image string."""
        print("updateThumbnail: ", songPath)
        try:
            tags = ID3(songPath)
        except ID3NoHeaderError:
            tags = ID3() # No ID3 header found, create a blank one

        if "base64," in base64String:
            header, base64Data = base64String.split("base64,")
            mime = header.replace("data:", "").split(";")[0]
        else:
            base64Data = base64String
            mime = 'image/jpeg' 

        imageBytes = base64.b64decode(base64Data)

        tags.add(
            APIC(
                encoding=3,
                mime=mime,
                type=3, 
                desc='Album cover',
                data=imageBytes
            )
        )

        tags.save(songPath, v2_version=3)

    def updateUniversalThumbnail(self, base64String: str, songPath: str) -> None:
        audio = mutagen.File(songPath)

        if "base64," in base64String:
            header, base64Data = base64String.split("base64,")
            mime = header.replace("data:", "").split(";")[0]
        else:
            base64Data = base64String
            mime = 'image/jpeg' 

        imageBytes = base64.b64decode(base64Data)
        
        if isinstance(audio, (ID3, mutagen.mp3.MP3, mutagen.wave.WAVE)):
            if audio.tags is None: audio.add_tags()
            audio.tags.add(APIC(encoding=3, mime=mime, type=3, desc='Album cover', data=imageBytes))
            audio.save(v2_version=3)
            return

        elif isinstance(audio, FLAC):
            from mutagen.flac import Picture
            pic = Picture()
            pic.data = imageBytes
            pic.type = 3 # Front Cover
            pic.mime = mime
            audio.add_picture(pic)
            
        elif isinstance(audio, MP4):
            from mutagen.mp4 import MP4Cover
            audio['covr'] = [MP4Cover(imageBytes, imageformat=MP4Cover.FORMAT_JPEG)]
            
        audio.save()

    def getYTData(self, url: str) -> dict:
        """Calls the dlp module to fetch video data from a YouTube URL."""
        return dlp.getYTData(url, downloadPath=self.downloadPath, window=self.downloadWindow)
        
    def downloadSong(self, url: str, cropDownload: bool=False, start: int=0, end: int=0) -> None:
        """Calls the dlp module to download a song from a YouTube URL with optional cropping."""
        dlp.downloadSong(url, downloadPath=self.downloadPath, window=self.downloadWindow, cropDownload=cropDownload, start=start, end=end)

    def addToInitQueue(self, songPaths: str) -> None:
        """Adds a single song path or a list of song paths to the initial playback queue."""
        if isinstance(songPaths, list):
            self.initQueue.extend([Path(f).as_posix() for f in songPaths])
        else:
            self.initQueue.append(Path(songPaths).as_posix())
    
    def addAndListenToMainQueue(self, songPath: str) -> None:
        """Sends a command to the main window's JavaScript to add a song to the queue and play it."""
        self.mainWindow.evaluate_js(f'addAndListenToQueue({json.dumps(Path(songPath).as_posix())})')

    def openPathFolder(self, path: str) -> None:
        """Opens the folder containing the specified path in the operating system's file explorer."""
        absPath = os.path.realpath(path)

        if platform.system() == "Windows": # Windows
            os.startfile(absPath)
        elif platform.system() == "Darwin": # MacOS
            subprocess.Popen(["open", absPath])
        else: # Linux
            subprocess.Popen(["xdg-open", absPath])

    def getSongsInFolder(self, path: str) -> list[str]:
        """Finds and returns a list of all MP3 file paths within a specified folder and its subfolders."""
        extensions = ('.mp3', '.flac', '.ogg', '.m4a', '.wav')
        return [f.as_posix() for f in list(Path(path).rglob('*')) if f.suffix.lower() in extensions]
            
    def getFolderViaFileDialog(self) -> str | None:
        """Opens a native OS file dialog and returns the chosen path."""
        result = self.mainWindow.create_file_dialog(webview.FOLDER_DIALOG)

        if result and isinstance(result, (list, tuple)) and len(result) > 0:
            print(f"Selected path: {Path(result[0]).as_posix()}")
            return Path(result[0]).as_posix()
        
        return None
    
    def getSongViaFileDialog(self) -> list[str] | None:
        """Opens a native OS file dialog for the user to select one or more MP3 files and returns their paths."""
        result = self.mainWindow.create_file_dialog(
            webview.FileDialog.OPEN, 
            allow_multiple=True,
            file_types=('Audio Files (*.mp3)', 'All files (*.*)')
        )

        if result and isinstance(result, (list, tuple)) and len(result) > 0:
            print(f"Selected file path: {result}")
            return [Path(f).as_posix() for f in result]
        
        return None
    
    def getImgViaFileDialog(self) -> str | None:
        """
        Opens a native OS file dialog for the user to select an image file and returns it as a base64 encoded data URI.
        Works fine with URLs.
        """
        result = self.metadataWindow.create_file_dialog(
            webview.FileDialog.OPEN, 
            allow_multiple=False,
            file_types=('Image Files (*.jpg;*.jpeg;*.png)', 'All files (*.*)')
        )
        if not result or len(result) == 0:
            return None
        
        filePath = Path(result[0]).as_posix()

        try:
            with open(filePath, "rb") as imgFile:
                encodedString = base64.b64encode(imgFile.read()).decode('utf-8')
                
                ext = os.path.splitext(filePath)[1].replace('.', '').lower()
                if ext == 'jpg': ext = 'jpeg'
                
                return f"data:image/{ext};base64,{encodedString}"
        except Exception as e:
            print(f"Erro ao processar imagem: {e}")
            return None
    
    def saveMetadata(self, data: dict, songPath: str) -> None:
        """Saves updated metadata to an MP3 file and updates the corresponding song data in the main window."""
        print("saveMetadata: ", songPath)
        if data and songPath: self.updateUniversalMetadata(data, songPath)
        self.mainWindow.evaluate_js(f"apiUpdateSongData({json.dumps(Path(songPath).as_posix())})")

    def readDataFile(self) -> dict:
        """Reads persistent application data from `data.json`, initializing defaults if the file is missing or corrupt."""
        updateData = False
        try:
            with open(f"./data.json", "r", encoding="utf-8") as dataFile:
                data = json.load(dataFile)
                if "config" in data and "downloadPath" in data["config"]: 
                    self.downloadPath = data["config"]["downloadPath"]
                else:
                    self.downloadPath = (Path.home()/'Music').as_posix()
                    data["config"] = {"downloadPath":self.downloadPath}
                    updateData = True

                if (not "folder" in data) or len(data["folder"]) == 0: 
                    data["folder"] = [self.downloadPath]
                    updateData = True

                if(updateData):
                    self.writeDataFile(data)

                return data
            
        except Exception as e:
            print("Error: "+str(e))
            musicPath = (Path.home()/'Music').as_posix()
            data = {"folder":[musicPath], "playlist":{}, "config":{"downloadPath":musicPath}}
            self.writeDataFile(data)
            return data

    def writeDataFile(self, data: dict) -> None:
        """Writes updated application data back to the `data.json` file."""
        try:
            with open(f"./data.json", "w", encoding="utf-8") as dataFile:
                json.dump(data, dataFile, ensure_ascii=False, indent=4)

            if data["config"] and data["config"]["downloadPath"] != self.downloadPath:
                self.downloadPath = data["config"]["downloadPath"] 

        except Exception as e:
            print("Error: "+str(e))
        
    def createMainWindow(self) -> None:
        """Creates the main application window and loads the default HTML interface."""
        w = 1380
        h = 840
        mainScreen = next(s for s in webview.screens if s.x == 0 and s.y == 0)

        self.mainWindow = webview.create_window(
            'Ylayer', 
            getAbsolutePath('index.html'), 
            js_api=SimpleNamespace(# Prevent recursion
                getAlbumArt=self.getAlbumArtSmall,
                getChangableTags=self.getChangableTags,
                getPlaylistMetadata=self.getPlaylistMetadata,
                log=self.log,
                getMP3=self.getMP3,
                openPathFolder=self.openPathFolder,
                readDataFile=self.readDataFile,
                writeDataFile=self.writeDataFile,
                getSongsInFolder=self.getSongsInFolder,
                getFolderViaFileDialog=self.getFolderViaFileDialog,
                getSongViaFileDialog=self.getSongViaFileDialog,
                createMetadataWindow=self.createMetadataWindow,
                createDownloadWindow=self.createDownloadWindow
            ),
            width=w, height=h,
            x=(mainScreen.width-w)/2, y=(mainScreen.height-h)/2, 
            min_size=(590, 219), 
            background_color='#202020',
            text_select=True
        )
        self.mainWindow.events.closed += self.onMainWindowDestroy
    
    def createMetadataWindow(self, songPath: str) -> None:
        """Creates a secondary window to view and edit metadata for a specific song path."""
        print("createMetadataWindow: ", songPath)
        w = 900
        h = 800

        if not self.metadataWindow and songPath:
            self.metadataWindow = webview.create_window(
                'Song Metadata', 
                getAbsolutePath("metadata.html")+"?songPath="+urllib.parse.quote(songPath),
                js_api=SimpleNamespace(# Prevent recursion
                    getMetadata=self.getMetadata,
                    getChangableTags=self.getChangableTags,
                    saveMetadata=self.saveMetadata,
                    log=self.log,
                    getAlbumArt=self.getAlbumArt,
                    updateThumbnail=self.updateUniversalThumbnail,
                    getImgViaFileDialog=self.getImgViaFileDialog,
                    addAndListenToMainQueue=self.addAndListenToMainQueue,
                    destroyMetadataWindow=self.destroyMetadataWindow
                ),
                width=w, height=h,
                x=self.mainWindow.x+(self.mainWindow.width-w)/2, y=self.mainWindow.y+(self.mainWindow.height-h)/2,
                background_color='#202020',
                text_select=True
            )
            self.metadataWindow.events.closed += self.onMetadataWindowDestroy

    def createDownloadWindow(self) -> None:
        """Creates a secondary window to handle YouTube downloading tasks."""
        w = 725
        h = 705
        if not self.downloadWindow:
            self.downloadWindow = webview.create_window(
                'Download Song', 
                getAbsolutePath("downloader.html"),
                js_api=SimpleNamespace(# Prevent recursion
                    log=self.log,
                    getYTData=self.getYTData,
                    downloadSong=self.downloadSong,
                    createMetadataWindow=self.createMetadataWindow,
                    addAndListenToMainQueue=self.addAndListenToMainQueue,
                    destroyDownloadWindow=self.destroyDownloadWindow
                ),
                width=w, height=h,
                x=self.mainWindow.x+(self.mainWindow.width-w)/2, y=self.mainWindow.y+(self.mainWindow.height-h)/2,
                resizable=False,
                background_color='#202020',
                text_select=True
            )
            self.downloadWindow.events.closed += self.onDownloadWindowDestroy

    def onMainWindowDestroy(self) -> None:
        self.mainWindow = None
        if self.metadataWindow:
            self.metadataWindow.destroy()
        if self.downloadWindow:
            self.downloadWindow.destroy()

    def onMetadataWindowDestroy(self) -> None:
        self.metadataWindow = None

    def onDownloadWindowDestroy(self) -> None:
        self.downloadWindow = None

    def destroyMetadataWindow(self) -> None:
        if self.metadataWindow:
            self.metadataWindow.destroy()

    def destroyDownloadWindow(self) -> None:
        if self.downloadWindow:
            self.downloadWindow.destroy()

    def setupDOM(self) -> None:
        self.mainWindow.dom.document.events.drop += self.onDrop
        self.mainWindow.evaluate_js(f'addToQueue({json.dumps(self.initQueue)})')

    def onDrop(self, event) -> None:
        print("files received")
        files = [Path(f['pywebviewFullPath']).as_posix() for f in event['dataTransfer']['files']]
        print(files)
        self.mainWindow.evaluate_js(f'addToQueue({json.dumps(files)})')
        
    def log(self, text: str) -> None:
        print("\033[93m"+str(text)+"\033[0m")