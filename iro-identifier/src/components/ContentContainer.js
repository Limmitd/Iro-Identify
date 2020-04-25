import React, { useState, useEffect } from 'react';
import FilterContainer from './FilterContainer';
import ResultList from './ResultList';
import axios from 'axios';


const ContentContainer = () => {
    const [images, setImages] = useState([]);
    const [filterList, setFilterList] = useState({filters: []});

    useEffect(() => {
        const fetchImages = async () => {
            const result = await axios.post("https://us-central1-iro-identifier.cloudfunctions.net/getImages");
            console.log(result);
            setImages(result.data.images);
        }
        fetchImages();
    }, [filterList]);

    const handleClick = () => {
        axios.post("https://us-central1-iro-identifier.cloudfunctions.net/getImagesFromOwner", {
            owner: "guest",
        }).then((res) => {
            console.log(res.data);
            setImages(res.data.images);
        });
    }

    const handleTest = () => {
        console.log(images);
    }
    
    return (
        <>
        <button onClick={() => handleClick()} >Send Request</button>
        <button onClick={() => handleTest()} >Test</button>
        <FilterContainer filters={filterList} setFilterList={setFilterList} />
        <ResultList images={images} />
        </>
    )
}

export default ContentContainer;