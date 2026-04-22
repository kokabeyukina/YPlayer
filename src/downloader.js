const urlInput = document.getElementById("url-input");
const minSlider = document.getElementById('min-slider');
const maxSlider = document.getElementById('max-slider');
const doubleSlider = document.querySelector(".double-range-wrapper");
const loadingSpan = document.getElementById("loading-span");
const videoSec = document.getElementById("video-section");
const downloadSec = document.getElementById("download-section");
const downloadStatus = document.getElementById('download-status');
const gap = 5; 
let songPath = "";

function intToTime(num){
    num = Math.floor(num);
    if(num < 3600){
        let mins = Math.floor(num / 60);
        let secs = num % 60;
        let formattedMins = String(mins).padStart(2, '0');
        let formattedSecs = String(secs).padStart(2, '0');
        return `${formattedMins}:${formattedSecs}`;
    }else{
        let hours = Math.floor(num / 3600);
        let remainingMins = num % 3600;
        let mins = Math.floor(remainingMins / 60);
        let secs = remainingMins % 60;
        let formattedHours = String(hours).padStart(2, '0');
        let formattedMins = String(mins).padStart(2, '0');
        let formattedSecs = String(secs).padStart(2, '0');
        return `${formattedHours}:${formattedMins}:${formattedSecs}`;
    }
}

function updateDoubleInput(){
    doubleSlider.style.setProperty('--min-crop', minSlider.value/minSlider.max*100 + '%');
    doubleSlider.style.setProperty('--max-crop', maxSlider.value/maxSlider.max*100 + '%');
    document.getElementById('min-txt').textContent = intToTime(minSlider.value);
    document.getElementById('max-txt').textContent = intToTime(maxSlider.value);
}

function searchSong(){
    loadingSpan.style.display = "block";
    videoSec.style.display = "none";
    downloadSec.style.display = "none";
    pywebview.api.getYTData(urlInput.value).then(data => {
        if(!data.success){
            loadingSpan.innerHTML = "Error: <br>"+data.error;
            return;
        }
        songPath = data.songPath;
        loadingSpan.style.display = "none";
        document.querySelector(".thumbnail img").src = data.thumbnail;
        document.getElementById("video-title").innerText = data.title;
        maxSlider.max = data.duration;
        minSlider.max = data.duration;
        maxSlider.value = data.duration;
        minSlider.value = 0;
        updateDoubleInput();
        videoSec.style.display = "block";
    });
}
urlInput.addEventListener("keydown", event => {
    if(event.key === "Enter"){
        event.preventDefault();
        searchSong();
    }
});

function downloadSong(){
    apiUpdateProgress(0);
    urlInput.setAttribute("readonly", "true");
    downloadSec.style.display = "block";
    downloadSec.querySelector(".button-row").style.display = "none";
    pywebview.api.downloadSong(urlInput.value, (minSlider.value != 0 || maxSlider.value != maxSlider.max), Number(minSlider.value), Number(maxSlider.value));
}

function apiUpdateStatus(status){
    downloadStatus.innerText = status;
    downloadStatus.title = status;
    if(status === "[Done]") {
        urlInput.removeAttribute("readonly");
        downloadSec.querySelector(".button-row").style.display = "flex";
    }
}

function apiUpdateSearchStatus(status){
    loadingSpan.innerHTML = status;
}

function apiUpdateProgress(percentage){
    document.getElementById("download-bar").style.setProperty('--progress', percentage + '%');
    document.querySelector("#download-progress span").innerText = percentage + '%';
}

function editMetadata(){
    pywebview.api.createMetadataWindow(songPath).then(() => 
        pywebview.api.destroyDownloadWindow());
}

function closeWindow(){
    pywebview.api.addAndListenToMainQueue(songPath).then(() => 
        pywebview.api.destroyDownloadWindow());
}

minSlider.oninput = () => {
    if(maxSlider.value - minSlider.value <= gap){
        if(Number(maxSlider.value) < Number(maxSlider.max)){
            maxSlider.value = Number(minSlider.value) + Number(maxSlider.step)*gap;
        }else{ 
            minSlider.value = Number(maxSlider.value) - gap;
        }
    }
    updateDoubleInput();
};

maxSlider.oninput = () => {
    if(maxSlider.value - minSlider.value <= gap){
        if(Number(minSlider.value) > Number(minSlider.min)){
            minSlider.value = Number(maxSlider.value) - Number(minSlider.step)*gap;
        }else{ 
            maxSlider.value = Number(minSlider.value) + gap;
        }
    }
    updateDoubleInput();
};