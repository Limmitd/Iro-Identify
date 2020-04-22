import React, { useState } from 'react';
import axios from 'axios';

const UploadPage = () => {
    const [selectedImages, setSelectedImages] = useState([]);

    const fileSelectedHandler = event => {
        const fileList = [];
        for (let i=0; i<event.target.files.length; i++) {
            if (!event.target.files[i].type.startsWith("image/")) {
                console.log("One of the selected files has an invalid file type and was not added to upload list!");
            } else if (event.target.files[i].size >= 10000000) {
                console.log("One of the files was 10MB or bigger and not added to upload list!")
            } else {
                fileList.push(event.target.files[i]);
            }
        }

        setSelectedImages(fileList);
    }

    const photoUploadHandler = () => {
        let promises = [];
        console.log("Uploading files...");

        const fd = new FormData();
        
        selectedImages.map(file => {
            fd.append("image", file, file.name);
            promises.push(axios.post("https://us-central1-iro-identifier.cloudfunctions.net/uploadFile", fd).then(res => {
                console.log(res);
            }).catch(err => console.log(err)));
            return true;
        });

        axios.all(promises).then(() => console.log("Uploading finished!"));
    }
    
    return (
        <div id="file-upload">
            <input type="file" multiple="multiple" onChange={(event) => fileSelectedHandler(event)} />
            <button onClick={() => photoUploadHandler()}>Upload</button>
        </div>
    );
}

export default UploadPage;