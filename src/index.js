const audioPlayer = document.getElementById('audio-player');
const audioSlider = document.getElementById('audio-slider');
const audioTime = document.getElementById('audio-time');
const playPauseBtn = document.getElementById('play-pause-btn');
const playbackBtn = document.getElementById('playback-btn');
const speedInput = document.querySelector('#speed-input input');
const speedSlider = document.getElementById('speed-slider');
const volumeSlider = document.getElementById('volume-slider');
const volumeIcon = document.getElementById('volume-icon');
const dropper = document.getElementById("dropper");
const explorer = document.getElementById('explorer');
const plCreator = document.getElementById('playlist-creator');
const settigsMenu = document.getElementById('settings-menu');

let isResizing = false;
let startX, startW;
let audioSliderDown = false;
let playbackState = 1;
let dragCounter = 0;

let externalData = {};
let pathLogger = {};
let playlistLogger = {"queue":[]};
let currentPlaylistId = "queue";
let queueIndex = 0;
let currentSongPath = "";


function intToTime(num){
    if(!num) num = 0;
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

function shuffle(array){
    let currentIndex = array.length;
    let randomIndex;

    while(currentIndex > 0){
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }

    return array;
}

async function addToPathLogger(songPath, rewrite=false){ 
    if(!pathLogger[songPath]) pathLogger[songPath] = {};

    if(!pathLogger[songPath].img || rewrite) await pywebview.api.getAlbumArt(songPath).then(img => {
        pathLogger[songPath].img = img;
    });

    if(!pathLogger[songPath].title || !pathLogger[songPath].artist || rewrite) await pywebview.api.getChangableTags(songPath).then(result => {
        if(result.missing){
            pathLogger[songPath].title = "[Deleted]";
            pathLogger[songPath].artist = "[No Song Found]";
            pathLogger[songPath].missing = true;
            return;
        }
        pathLogger[songPath].title = result.title || songPath.split(/[\\/]/).pop() || "[No Title]";
        pathLogger[songPath].artist = result.artist || "[No Artist]";
    });
}

async function addToPlaylistLogger(id, playlist){
    playlistLogger[id] = playlist;
    Object.assign(pathLogger, await pywebview.api.getPlaylistMetadata(playlist));
    //for(song of playlist) await addToPathLogger(song);
}

async function replaceThumb(songPath){
    document.querySelector("#footer .thumbnail img").src = pathLogger[songPath].img || "./album_placeholder.png";
}

async function replaceSongLabel(songPath){
    document.getElementById('title-label').textContent = pathLogger[songPath].title;
    document.getElementById('artist-label').textContent = pathLogger[songPath].artist;
}

function replaceAudio(songPath){
    pywebview.api.getMP3(songPath).then(result => {
        audioPlayer.src = result;
        audioPlayer.currentTime = 0;
        audioPlayer.play();
    });
}

function changeSong(songPath, id="queue"){
    if(!songPath){
        currentSongPath = ""; 
        document.querySelector("#footer .thumbnail img").src = "./album_placeholder.png";
        document.getElementById('title-label').textContent = "[No Title]";
        document.getElementById('artist-label').textContent = "[No Artist]";
        document.querySelectorAll('.tab-pane .song-item.active').forEach(o => {o.classList.remove('active')});
        audioTime.textContent = intToTime(0);
        document.getElementById('audio-length').textContent = intToTime(0);
        if(!audioPlayer.paused){
            playPauseBtn.src = 'icon/play_arrow.svg';
            let tabPlayer = document.querySelector(`.tab-pane[data-tab_id="${CSS.escape(currentPlaylistId)}"] .tab-player`);
            if(tabPlayer) tabPlayer.src = 'icon/play_arrow.svg';
        }
        audioPlayer.currentTime = 0;
        audioPlayer.src = "";
        return;
    }
    
    currentSongPath = songPath;
    replaceThumb(songPath);
    replaceSongLabel(songPath);
    replaceAudio(songPath);
    document.querySelectorAll('.tab-pane .song-item.active').forEach(o => {o.classList.remove('active')});
    document.querySelector(`.tab-pane[data-tab_id="${CSS.escape(id)}"] .tab-list .song-item[data-path="${CSS.escape(songPath)}"]`)?.classList.add('active');
}




async function addToQueue(newSong, id="queue", ct="queue", plSave=true){
    let wasEmpty = playlistLogger[id].length === 0;
    let songsToAdd = (Array.isArray(newSong) ? [...newSong] : [newSong]).filter(o => !playlistLogger[id].includes(o));
    if(songsToAdd.length === 0) return;

    for(o of songsToAdd) await addToPathLogger(o);
    playlistLogger[id].push(...songsToAdd);

    if(ct === "playlist" && plSave){
        externalData.playlist[id].push(...songsToAdd);
        pywebview.api.writeDataFile(externalData);
    }

    let tab = document.querySelector(`.tab-pane[data-tab_id="${CSS.escape(id)}"] .tab-list`);

    if(wasEmpty && playlistLogger[id].length > 0){
        tab.innerHTML = createSongItems(playlistLogger[id], ct);
        if(id === currentPlaylistId){
            queueIndex = 0;
            changeSong(playlistLogger[id][queueIndex], id);
        }
    }else{
        //tab.innerHTML += createSongItems(songsToAdd, ct);
        tab.insertAdjacentHTML('beforeend', createSongItems(songsToAdd, ct));
    }
}

async function addAndListenToQueue(newSong, id="queue", ct="queue"){
    let songs = Array.isArray(newSong) ? newSong : [newSong];
    let songsToAdd = songs.filter(o => !playlistLogger[id].includes(o));
    if(songsToAdd.length === 0){ 
        queueIndex = playlistLogger[id].indexOf(songs[0]);
        changeSong(playlistLogger[id][queueIndex], id);
        return;
    }

    await addToQueue(songsToAdd, id, ct);
    queueIndex = playlistLogger[id].indexOf(songsToAdd[0]);
    changeSong(playlistLogger[id][queueIndex], id);
}

function setQueue(newPlaylist, id="queue", ct="queue", plSave=true){
    if(newPlaylist?.length === 0) return;
    playlistLogger[id] = [];
    addToQueue(newPlaylist, id, ct, plSave=plSave);
}

function getSongViaFileDialog(id="queue", ct="queue"){ 
    pywebview.api.getSongViaFileDialog().then(paths => {
        if(paths) addToQueue(paths, id, ct);
    });
}




async function apiUpdateSongData(songPath){
    pywebview.api.log("calling apiUpdateSongData")
    await addToPathLogger(songPath, rewrite=true);
    pywebview.api.log(CSS.escape(songPath))
    pywebview.api.log(songPath)
    pywebview.api.log(currentSongPath)

    document.querySelectorAll('.tab-pane').forEach(tab => {
        let songItem = tab.querySelector(`.tab-list .song-item[data-path="${CSS.escape(songPath)}"]`);
        if(!songItem){
            pywebview.api.log(tab.dataset.tab_id+": no shit found");
            return;
        }

        songItem.querySelector("img").src = pathLogger[songPath].img;
        songItem.querySelector(".title").innerText = pathLogger[songPath].title;
        songItem.querySelector(".artist").innerText = pathLogger[songPath].artist;
        songItem.querySelector(".title").title = pathLogger[songPath].title;
        songItem.querySelector(".artist").title = pathLogger[songPath].artist;
        pywebview.api.log(tab.dataset.tab_id+": songItem updated")
    });

    if(songPath === currentSongPath){
        replaceThumb(songPath);
        replaceSongLabel(songPath);
        pywebview.api.log("player updated")
    }
}

function createSongItems(list, type="queue"){
    let buttons = "";
    if(["folder", "playlist"].includes(type)){
        buttons += '<button class="toQueue-songItem-btn">Add to Queue</button>';
    }
    if(["queue", "playlist"].includes(type)){
        buttons += '<button class="delete-songItem-btn">Delete</button>';
    }

    return list.map(path => {
        const song = pathLogger[path] || {};
        const title = song.title || "[No Title]";
        const artist = song.artist || "[No Artist]";
        const img = song.img || "./album_placeholder.png";

        return `
            <div class="song-item" data-path="${path}">
                <div class="song-wrapper">
                    <div class="thumb-wrapper">
                        <div class="thumbnail"><img src="${img}"></div>
                    </div>
                    <div class="song-info">
                        <div class="label">
                            <span class="title" title="${title}">${title}</span>
                            <span class="artist" title="${artist}">${artist}</span>
                        </div>
                        <div class="song-menu">
                            <img src="icon/more.svg" class="more-btn">
                            <div class="options">
                                <button class="edit-songItem-btn">Edit</button>
                                ${buttons}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function changeTab(id){
    let tab = document.querySelector(`.tab-item[data-tab_id="${CSS.escape(id)}"]`);
    let pane = document.querySelector(`.tab-pane[data-tab_id="${CSS.escape(id)}"]`);
    if(!(tab && pane)) return;
    
    document.querySelectorAll('.tab-item.active').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-pane.active').forEach(pane => pane.classList.remove('active'));
    tab.classList.add('active');
    pane.classList.add('active');
}

function createExplorerItem(id, container){
    let name = id.split(/[\\/]/).pop()
    container.innerHTML += `
        <div class="item" data-tab_id="${id}">
            <span title="${name}">${name}</span>
            <img src="icon/delete.svg" class="icon-button">
        </div>
    `;
}

explorer.addEventListener('click', async e => {
    const item = e.target.closest('.item');
    const deleteBtn = e.target.closest('.item .icon-button');
    const header = e.target.closest('#explorer .header');
    const addBtn = e.target.closest('#explorer .header .icon-button');
    const ct = e.target.closest('.category').dataset.category;

    if(addBtn){
        if(ct == "playlist"){
            plCreator.style.display = "flex";
        }else if(ct == "folder") pywebview.api.getFolderViaFileDialog().then(folder => {
            if(!externalData.folder.includes(folder)){
                createExplorerItem(folder, header.closest('.category').querySelector('.container'));
                externalData.folder.push(folder);
                pywebview.api.writeDataFile(externalData);
            }
        });

    }else if(header){
        const container = header.closest('.category').querySelector('.container');
        container.classList.toggle('collapsed');
        header.querySelector('.expand-btn').style.transform = container.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';

    }else if(deleteBtn){
        let id = item.dataset.tab_id;
        item.remove();
        deleteTab(id);
        deletePlaylist(id);
        if(ct == "folder"){
            externalData.folder.splice(externalData.folder.indexOf(id), 1);
        }else if(ct == "playlist"){
            delete externalData.playlist[id];
        }
        pywebview.api.writeDataFile(externalData);

    }else if(item){
        let id = item.dataset.tab_id;

        if(document.querySelector(`.tab-item[data-tab_id="${CSS.escape(id)}"]`) !== null){
            changeTab(id);
            return;
        }

        let name = item.querySelector("span").innerText;

        document.getElementById("tabs-header").innerHTML += `
            <div class="tab-item" data-tab_id="${id}">
                <img src="icon/${ct}.svg">
                <span>${name}</span>
                <img src="icon/close.svg" class="icon-button">
            </div>
        `;


        let buttons = "";
        if(ct == "playlist"){
            buttons += '<img class="icon-button add-playlist-btn" src="icon/plus.svg" title="Add songs">';
        }else if(ct == "folder"){
            buttons += '<img class="icon-button open-folder-btn" src="icon/folder_open.svg" title="Open local folder">';
            let songs = await pywebview.api.getSongsInFolder(id);
            await addToPlaylistLogger(id, songs);
        }

        document.getElementById("tab-body").innerHTML += `
            <div class="tab-pane" data-tab_id="${id}" data-category="${ct}">
                <div class="tab-tools">
                    <img src="icon/play_arrow.svg" class="tab-player" height="100">
                    <div class="tools-menu">
                        <div class="title"><img src="icon/${ct}.svg">${name}</div>
                        <div class="options">
                            ${buttons}
                            <img class="icon-button append-queue-btn" src="icon/playlist_add.svg" title="Append to Queue">
                            <img class="icon-button shuffle-btn" src="icon/random_off.svg" title="Shuffle songs">
                        </div>
                    </div>
                </div>
                <div class="tab-list">
                    ${createSongItems(playlistLogger[id] || [], ct)}
                </div>
            </div>
        `;

        changeTab(id);
    }
});




document.getElementById('explorer-handle').addEventListener('mousedown', e => {
    isResizing = true;
    startX = e.clientX;
    startW = explorer.offsetWidth;
    e.stopPropagation();
    e.preventDefault();
});

document.addEventListener('mouseup', () => {
    if(isResizing) isResizing = false;
});

document.addEventListener('mousemove', e => {
    if(isResizing){
        let newWidth = startW + e.clientX - startX;
        explorer.style.width = `${newWidth}px`;
    }
});

function deletePlaylist(id){
    if(id === currentPlaylistId){
        currentPlaylistId = "queue";
        queueIndex = 0;
        if(playlistLogger[currentPlaylistId]?.length > 0) changeSong(playlistLogger[currentPlaylistId][queueIndex], currentPlaylistId);
    }
    delete playlistLogger[id];
}

function deleteTab(id){
    if(document.querySelector(`.tab-item[data-tab_id="${CSS.escape(id)}"]`)?.classList.contains('active')){
        document.querySelector(`.tab-item[data-tab_id="queue"]`).classList.add('active');
        document.querySelector(`.tab-pane[data-tab_id="queue"]`).classList.add('active');
    }
    document.querySelector(`#tabs-header [data-tab_id="${CSS.escape(id)}"]`)?.remove();
    document.querySelector(`#tab-body [data-tab_id="${CSS.escape(id)}"]`)?.remove();
}

document.querySelector('#tabs-header').addEventListener('click', e => {
    const tab = e.target.closest('.tab-item');
    const closeBtn = e.target.closest('.icon-button')

    if(closeBtn){
        const id = tab.dataset.tab_id;
        deleteTab(id);
        deletePlaylist(id);
    }else if(tab){
        changeTab(tab.dataset.tab_id)
    }
});




function openMetadataWindow(songPath){
    pywebview.api.createMetadataWindow(songPath);
}

function deleteSongItem(songPath, id, ct){
    delete pathLogger[songPath];
    let index = playlistLogger[id].indexOf(songPath);
    playlistLogger[id].splice(index, 1);

    let prevIndex = queueIndex;
    if(queueIndex >= index && queueIndex !== 0) queueIndex--;

    if(id === currentPlaylistId && index === prevIndex)
        changeSong(playlistLogger[currentPlaylistId][queueIndex], currentPlaylistId);

    if(ct === "playlist"){
        externalData.playlist[id].splice(playlistLogger[id].indexOf(songPath), 1);
        pywebview.api.writeDataFile(externalData);
    }

    let tab = document.querySelector(`.tab-pane[data-tab_id="${CSS.escape(id)}"] .tab-list`);
    let songItem = tab.querySelector(`.song-item[data-path="${CSS.escape(songPath)}"]`);
    tab.removeChild(songItem);

    pywebview.api.log(`Deleting item ${queueIndex} from ${id} (${songItem.dataset.path})`);
}

document.querySelector('#tab-body').addEventListener('click', e => {
    const tab = e.target.closest('.tab-pane');
    if(!tab) return;

    const id = tab.dataset.tab_id;
    const ct = tab.dataset.category;
    const wrapper = e.target.closest('.song-wrapper');
    const tools = e.target.closest('.tab-tools');

    if(e.target.closest('.song-menu')){
        let path = e.target.closest('.song-item').dataset.path;
        if(e.target.closest('.edit-songItem-btn') && !pathLogger[path].missing) openMetadataWindow(path);
        else if(e.target.closest('.delete-songItem-btn')) deleteSongItem(path, id, ct);
        else if(e.target.closest('.toQueue-songItem-btn') && !pathLogger[path].missing) addToQueue(path);
    }else if(wrapper){
        let path = e.target.closest('.song-item').dataset.path;
        if(currentPlaylistId !== id){
            let tabPlayer = document.querySelector(`.tab-pane[data-tab_id="${CSS.escape(currentPlaylistId)}"] .tab-player`);
            if(tabPlayer) tabPlayer.src = 'icon/play_arrow.svg';
            currentPlaylistId = id;
        }

        queueIndex = playlistLogger[id].indexOf(path);
        changeSong(path, id);
    }else if(tools){
        if(e.target.closest('.tab-player')){
            if(currentPlaylistId === id){
                playPause();
            }else{
                let tabPlayer = document.querySelector(`.tab-pane[data-tab_id="${CSS.escape(currentPlaylistId)}"] .tab-player`);
                if(tabPlayer) tabPlayer.src = 'icon/play_arrow.svg';
                
                queueIndex = 0;
                currentPlaylistId = id;
                changeSong(playlistLogger[id][queueIndex], id);
            }

        }
        else if(e.target.closest('.add-playlist-btn')) getSongViaFileDialog(id, ct);
        else if(e.target.closest('.open-folder-btn')) pywebview.api.openPathFolder(id);
        else if(e.target.closest('.append-queue-btn')) addToQueue(playlistLogger[id]);
        else if(e.target.closest('.shuffle-btn')){
            shuffle(playlistLogger[id]);
            setQueue(playlistLogger[id], id, ct, false);
        }
    }
});




document.getElementById('download-btn').addEventListener('click', () => {
    pywebview.api.createDownloadWindow();
});

document.getElementById('settings-btn').addEventListener('click', openSettingsMenu);

document.getElementById('stop-btn').addEventListener('click', () => {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
});

playbackBtn.addEventListener('click', () => {
    playbackState++;
    if(playbackState >= 3) playbackState = 0;
    switch(playbackState){
        case 0: 
            playbackBtn.src = "icon/repeat_off.svg";
            break;
        case 1: 
            playbackBtn.src = "icon/repeat_on.svg";
            break;
        case 2: 
            playbackBtn.src = "icon/repeat_one_on.svg";
    }
});

document.getElementById('edit-btn').addEventListener('click', () => {
    openMetadataWindow(currentSongPath);
});




function gotoNext(){
    queueIndex++;
    if(queueIndex >= playlistLogger[currentPlaylistId].length){
        if(playbackState == 0) return;
        queueIndex = 0;
    }
    changeSong(playlistLogger[currentPlaylistId][queueIndex], currentPlaylistId);
}

function gotoPrev(){
    queueIndex--;
    if(queueIndex < 0){
        if(playbackState == 0) return;
        queueIndex = playlistLogger[currentPlaylistId].length-1;
    }
    changeSong(playlistLogger[currentPlaylistId][queueIndex], currentPlaylistId);
}

document.getElementById('skip-left-btn').addEventListener('click', gotoPrev);

function playPause(){
    if(audioPlayer.paused){
        audioPlayer.play();
    }else{
        audioPlayer.pause();
    }
}

playPauseBtn.addEventListener('click', playPause);

document.getElementById('skip-right-btn').addEventListener('click', gotoNext);




function updateVolume(){
    audioPlayer.volume = volumeSlider.value/100;
    if(volumeSlider.value > 66){
        volumeIcon.src = "icon/volume_100.svg";
    }else if(volumeSlider.value > 33){
        volumeIcon.src = "icon/volume_66.svg";
    }else if(volumeSlider.value > 0){
        volumeIcon.src = "icon/volume_33.svg";
    }else{
        volumeIcon.src = "icon/volume_0.svg";
    }
}

volumeSlider.addEventListener('input', updateVolume);

document.getElementById('volume').addEventListener('wheel', e => {
    volumeSlider.value = volumeSlider.value - e.deltaY/Math.abs(e.deltaY)*5;
    updateVolume();
});

volumeIcon.addEventListener('click', () => {
    volumeSlider.value = volumeSlider.value == 0 ? 100: 0;
    updateVolume();
});




function updateSpeed(){
    speedInput.value = parseFloat(speedSlider.value).toFixed(2);
    audioPlayer.playbackRate = speedInput.value;
}

speedSlider.addEventListener('input', updateSpeed);

document.getElementById('speed').addEventListener('wheel', e => {
    speedSlider.value = speedSlider.value - e.deltaY/Math.abs(e.deltaY)*speedSlider.step;
    updateSpeed();
});

speedInput.addEventListener("change", e => {
    let inputSpeed = +e.target.value;
    if(Number.isFinite(inputSpeed)){
        speedInput.value = parseFloat(Math.min(Math.max(inputSpeed, 0.0625), 16)).toFixed(2);
        speedSlider.value = speedInput.value;
        audioPlayer.playbackRate = speedInput.value;
    }else{
        updateSpeed();
    }
});




audioSlider.addEventListener('change', () => {
    audioPlayer.currentTime = audioSlider.value*audioPlayer.duration/100;
    audioSlider.style.setProperty('--progress-percent', audioSlider.value + '%');
});

audioSlider.addEventListener('input', () => {
    audioTime.textContent = intToTime(audioSlider.value*audioPlayer.duration/100);
    audioSlider.style.setProperty('--progress-percent', audioSlider.value + '%');
});

audioSlider.addEventListener('mouseup', () => audioSliderDown = false);

audioSlider.addEventListener('mousedown', () => audioSliderDown = true);




audioPlayer.addEventListener('timeupdate', () => {
    if(!audioSliderDown){
        if(audioPlayer.duration){
            audioSlider.value = audioPlayer.currentTime*100/audioPlayer.duration;
            audioSlider.style.setProperty('--progress-percent', audioSlider.value + '%');
        }else{
            audioSlider.value = 0;
            audioSlider.style.setProperty('--progress-percent', 0+ '%');
        }
        audioTime.textContent = intToTime(audioPlayer.currentTime);
    }
});

audioPlayer.onloadedmetadata = () => {
    document.getElementById('audio-length').textContent = intToTime(audioPlayer.duration);
};

audioPlayer.addEventListener('ended', () => {
    if(playbackState == 2){
        audioPlayer.currentTime = 0;
        audioPlayer.play();
    }else if(playbackState == 0 && queueIndex >= playlistLogger[currentPlaylistId].length-1){
        audioPlayer.pause();
    }else if(playbackState in [1, 0]){
        gotoNext();
    }
});

audioPlayer.addEventListener('pause', () => {
    playPauseBtn.src = 'icon/play_arrow.svg';
    let tabPlayer = document.querySelector(`.tab-pane[data-tab_id="${CSS.escape(currentPlaylistId)}"] .tab-player`);
    if(tabPlayer) tabPlayer.src = 'icon/play_arrow.svg';
});

audioPlayer.addEventListener('play', () => {
    if(!currentSongPath) return;
    playPauseBtn.src = 'icon/pause.svg';
    let tabPlayer = document.querySelector(`.tab-pane[data-tab_id="${CSS.escape(currentPlaylistId)}"] .tab-player`);
    if(tabPlayer) tabPlayer.src = 'icon/pause.svg';
});




function closePlayListCreator(){
    plCreator.style.display = "none";
    plCreator.querySelector('input').value = "";
}

function createPlaylist(){
    let name = plCreator.querySelector('input').value;
    if(name in externalData.playlist || !name || name === "queue" || /[\\/]/.test(name)){
        alert("Playlist already exists or has invalid name."); 
        return;
    }
    createExplorerItem(name, document.querySelector('.category[data-category="playlist"] .container'));
    externalData.playlist[name] = [];
    playlistLogger[name] = [];
    pywebview.api.writeDataFile(externalData);
    closePlayListCreator();
}

function openSettingsMenu(){
    settigsMenu.style.display = "flex";
    if("config" in externalData && "downloadPath" in externalData["config"])
        settigsMenu.querySelector('input[name="downloadPath"]').value = externalData["config"]["downloadPath"];
}

function closeSettingsMenu(){
    settigsMenu.style.display = "none";
}

function saveSettings(){
    let downloadPath = settigsMenu.querySelector('input[name="downloadPath"]').value;
    if("config" in externalData && downloadPath){
        externalData["config"]["downloadPath"] = downloadPath;
        pywebview.api.writeDataFile(externalData);
    }
    closeSettingsMenu();
}




window.addEventListener('dragenter', e => {
    e.preventDefault();
    dragCounter++;
    dropper.style.display = "block";
});

window.addEventListener('dragleave', e => {
    e.preventDefault();
    dragCounter--;
    if(dragCounter === 0) dropper.style.display = "none";
});

window.addEventListener('dragover', e => {
    e.preventDefault();
});

window.addEventListener('drop', e => {
    e.preventDefault();
    dragCounter = 0;
    dropper.style.display = "none";
});

window.addEventListener('pywebviewready', async () => {
    updateVolume();
    externalData = await pywebview.api.readDataFile();
    externalData.folder.forEach(path => createExplorerItem(path, document.querySelector('.category[data-category="folder"] .container')));
    let container = document.querySelector('.category[data-category="playlist"] .container');
    for(key in externalData.playlist){ 
        createExplorerItem(key, container);
        addToPlaylistLogger(key, [...externalData.playlist[key]]);
    }
});