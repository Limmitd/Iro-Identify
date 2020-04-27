import React, { useState } from 'react';
import axios from 'axios';

const UploadPage = () => {
    const [selectedImages, setSelectedImages] = useState([]);
    const MaxRequestSize = 5 * 1000 * 1000;

    const fileSelectedHandler = event => {
        let fileList = [];
        for (const file of event.target.files) {
            if (!file.type.startsWith("image/jpeg") && !file.type.startsWith("image/png")) {
                console.log(`Images must either be of jpg or png format! One of the selected files has an invalid file type and was not added to upload list.`);
            } else if (file.size > MaxRequestSize) {
                console.log(`One of the files was larger than the max upload size of ${((MaxRequestSize/1024)/1024)}MB and was not added to upload list!`)
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

        let images = selectedImages.slice();
        // sorts image list by size
        images.sort((a, b) => (a.size > b.size) ? 1 : -1);

        console.log("Uploading images...");
        let promises = [];

        // creates requests to not exceed MaxRequestSize limit in a single request
        while (images.length > 0) {
            let size = 0;
            let fd = new FormData();

            // gets image with largest size and adds to formdata
            let largest = images.pop();
            size += largest.size;
            fd.append("image", largest, largest.name);

            // continues to add smallest size photos until upload image is reached or no remaining images fit
            while (( size < MaxRequestSize ) && ( images.length > 0 )) {
                if (( images[0].size + size ) > MaxRequestSize) {
                    break;
                } else {
                    let smallest = images.shift();
                    size += smallest.size;
                    fd.append("image", smallest, smallest.name);
                }
            }

            // once form has been filled up to MaxRequestSize size, a request is sent and the promise added to list
            promises.push(axios.post("https://us-central1-iro-identifier.cloudfunctions.net/uploadImages", fd).then(res => {
                    console.log(res);
            }).catch(err => console.log(err)));
        }

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