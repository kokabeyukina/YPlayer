let SongData = {};
let urlParams;
let songPath;
let titleInput;
let artistInput;
let albumInput;
let yearInput;
let purlInput;
let descriptionInput;
let usltInput;

window.addEventListener('pywebviewready', () => {
    titleInput = document.getElementById('title');
    artistInput = document.getElementById('artist');
    albumInput = document.getElementById('album');
    yearInput = document.getElementById('year');
    purlInput = document.getElementById('purl');
    descriptionInput = document.getElementById('description');
    usltInput = document.getElementById('uslt');
    
    let queryString = window.location.search;
    urlParams = new URLSearchParams(queryString);
    urlParams.forEach((value, key) => {
        if(key === "songPath"){
            songPath = value;
            document.querySelector("#file-path span").innerText = value;
        }
    });

    pywebview.api.getMetadata(songPath).then(result => {
        if(!result.success){
            pywebview.api.log("Error: "+result.error);
            return;
        }

        for(const [key, value] of Object.entries(result.data)){
            tagContainer = document.createElement("div");
            tagContainer.classList.add("tag-item");
            tagKey = document.createElement("span");
            tagKey.classList.add("tag-key");
            tagKey.innerHTML = key;
            tagValue = document.createElement("span");
            tagValue.classList.add("tag-value");
            tagValue.innerHTML = value;
            tagContainer.appendChild(tagKey);
            tagContainer.appendChild(tagValue);
            document.getElementById('tag-list').appendChild(tagContainer);
        }
    });
    pywebview.api.getChangableTags(songPath).then(data => {
        SongData = data;
        titleInput.value = data.title; 
        artistInput.value = data.artist;
        albumInput.value = data.album; 
        yearInput.value = data.year;
        purlInput.value = data.purl;
        descriptionInput.value = data.description;
        usltInput.value = data.uslt;
    });
    pywebview.api.getAlbumArt(songPath).then(result => {
        document.getElementById("source-img").src = result;
        document.getElementById('result-preview').src = result;
    });
});

async function saveMetadata(){
    let newData = {};
    if(titleInput.value !== SongData.title){
        newData["title"] = titleInput.value;
    }
    if(artistInput.value !== SongData.artist){
        newData["artist"] = artistInput.value;
    }
    if(albumInput.value !== SongData.album){
        newData["album"] = albumInput.value;
    }
    if(yearInput.value !== SongData.year){
        newData["year"] = yearInput.value;
    }
    if(purlInput.value !== SongData.purl){
        newData["purl"] = purlInput.value;
    }
    if(descriptionInput.value !== SongData.description){
        newData["description"] = descriptionInput.value;
    }
    if(usltInput.value !== SongData.uslt){
        newData["uslt"] = usltInput.value;
    }
    if(document.getElementById("source-img").src !== document.getElementById('result-preview').src){
        await pywebview.api.updateThumbnail(document.getElementById('result-preview').src, songPath);
    }
    await pywebview.api.saveMetadata(newData, songPath);
}

function saveAndClose(){
    saveMetadata().then(() => 
        pywebview.api.destroyMetadataWindow());
}

async function saveAndListen(){
    await saveMetadata();
    await pywebview.api.addAndListenToMainQueue(songPath);
    pywebview.api.destroyMetadataWindow();
}

function showHideInfo(){
    const tagList = document.getElementById('tag-list');
    const showBtn = document.getElementById('more-less-btn');
    if(window.getComputedStyle(tagList).display === "none"){
        tagList.style.display = "flex";
        showBtn.innerText = "Less Info";
    }else{
        tagList.style.display = "none";
        showBtn.innerText = "More Info";
    }
}

function cropImage(){
    const img = document.getElementById('source-img');
    const frame = document.getElementById('crop-frame');
    const canvas = document.getElementById('output-canvas'); // Create in memory
    const ctx = canvas.getContext('2d');

    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;

    const sourceX = frame.offsetLeft * scaleX;
    const sourceY = frame.offsetTop * scaleY;
    const sourceWidth = frame.offsetWidth * scaleX;
    const sourceHeight = frame.offsetHeight * scaleY;

    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    ctx.drawImage(
      img,
      sourceX, sourceY, sourceWidth, sourceHeight, // Source Rect
      0, 0, sourceWidth, sourceHeight             // Destination Rect
    );
    document.getElementById('result-preview').src = canvas.toDataURL('image/png');
}

function addImage(){
    pywebview.api.getImgViaFileDialog().then(data => {
        if(data) document.getElementById('source-img').src = data;
    });
}

function squareIt(){
    const frame = document.getElementById('crop-frame');
    if(window.getComputedStyle(frame).width > window.getComputedStyle(frame).height){
        frame.style.width = window.getComputedStyle(frame).height;
    }else{
        frame.style.height = window.getComputedStyle(frame).width;
    }
}

let isDragging = false;
let isResizing = false;
let startX, startY, startW, startH, initialLeft, initialTop;
    
document.addEventListener('DOMContentLoaded', () => {
    const img = document.getElementById('source-img');
    const frame = document.getElementById('crop-frame');
    const handle = document.getElementById('resize-handle');

    // --- RESIZE LOGIC ---
    handle.addEventListener('mousedown', e => {
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startW = frame.offsetWidth;
        startH = frame.offsetHeight;
        e.stopPropagation(); // Prevents the 'drag' logic from firing too
        e.preventDefault();
    });

    // --- DRAG LOGIC ---
    frame.addEventListener('mousedown', e => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = frame.offsetLeft;
        initialTop = frame.offsetTop;
        e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
        if(isResizing){
            // Calculate new size
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            let newWidth = startW + deltaX;
            let newHeight = startH + deltaY;

            // Keep aspect ratio 1:1 for profile pictures (Optional)
            // Comment these next two lines out if you want free-form resizing
            ////const size = Math.max(newWidth, newHeight);
            ////newWidth = newHeight = size;

            // Boundaries: Don't resize past the image edge
            const maxWidth = img.clientWidth - frame.offsetLeft;
            const maxHeight = img.clientHeight - frame.offsetTop;
            
            frame.style.width = `${Math.min(newWidth, maxWidth)}px`;
            frame.style.height = `${Math.min(newHeight, maxHeight)}px`;

        }else if(isDragging){
            // Existing Drag Logic
            let newX = initialLeft + (e.clientX - startX);
            let newY = initialTop + (e.clientY - startY);

            const maxLeft = img.clientWidth - frame.offsetWidth;
            const maxTop = img.clientHeight - frame.offsetHeight;

            frame.style.left = `${Math.max(0, Math.min(newX, maxLeft))}px`;
            frame.style.top = `${Math.max(0, Math.min(newY, maxTop))}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        isResizing = false;
    });

    document.getElementById('crop-img-btn').addEventListener('click', cropImage);
    document.getElementById('square-btn').addEventListener('click', squareIt);
    document.getElementById('add-img-btn').addEventListener('click', addImage);
});
