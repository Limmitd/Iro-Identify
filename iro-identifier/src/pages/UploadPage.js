import React, { useState } from 'react';
import axios from 'axios';

const UploadPage = () => {
    const [selectedImages, setSelectedImages] = useState([]);
    const MaxUpload = 10000000;

    const fileSelectedHandler = event => {
        let fileList = [];
        for (const file of event.target.files) {
            if (!file.type.startsWith("image/")) {
                console.log("One of the selected files has an invalid file type and was not added to upload list!");
            } else if (file.size > MaxUpload) {
                console.log(`One of the files was larger than the max upload size of ${MaxUpload} and was not added to upload list!`)
            } else {
                fileList.push(file);
            }
        }

        setSelectedImages(fileList);
    }

    const photoUploadHandler = () => {
        if (selectedImages.length < 0) {
            console.log("Please select files before uploading!");
            return;
        }

        console.log("Sorting images...");
        let images = selectedImages.slice();
        // sorts image list by size
        images.sort((a, b) => (a.size > b.size) ? 1 : -1);

        console.log("Uploading images...");
        let promises = [];

        // creates requests to not exceed MaxUpload limit in a single request
        while (images.length > 0) {
            let size = 0;
            let fd = new FormData();

            // gets image with largest size and adds to formdata
            let largest = images.pop();
            size += largest.size;
            fd.append("image", largest, largest.name);

            // continues to add smallest size photos until upload image is reached or no remaining images fit
            while (( size < MaxUpload ) && ( images.length > 0 )) {
                if (( images[0].size + size ) > MaxUpload) {
                    break;
                } else {
                    let smallest = images.shift();
                    size += smallest.size;
                    fd.append("image", smallest, smallest.name);
                }
            }

            // once form has been filled up to MaxUpload size, a request is sent and the promise added to list
            promises.push(axios.post("https://us-central1-iro-identifier.cloudfunctions.net/uploadFile", fd).then(res => {
                    console.log(res);
            }).catch(err => console.log(err)));
            console.log("Request sent...");
        }

        console.log("Waiting to finish uploading...");

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