import React, { useState, useEffect } from 'react';
import FilterContainer from './FilterContainer';
import ResultList from './ResultList';
import axios from 'axios';


const ContentContainer = () => {
    const [images, setImages] = useState([]);
    const [filterList, setFilterList] = useState({filters: []});

    useEffect(() => {
        const fetchImages = async () => {
            const result = await axios.post("https://us-central1-iro-identifier.cloudfunctions.net/getImages", {
                colors: {
                    red: false,
                    redOrange: false,
                    orange: false,
                    orangeYellow: false,
                    yellow: false,
                    yellowGreen: false,
                    green: false,
                    greenBlue: false,
                    blue: false,
                    blueViolet: false,
                    violet: false,
                    violetRed: false,
                },
            }).then((res) => {
                console.log(res.data);
                setImages(res.data.images);
            });
        }
        fetchImages();
    }, [filterList]);

    const refineSearch = () => {
        axios.post("https://us-central1-iro-identifier.cloudfunctions.net/getImages", {
            colors: {
                red: false,
                redOrange: false,
                orange: false,
                orangeYellow: false,
                yellow: false,
                yellowGreen: false,
                green: false,
                greenBlue: false,
                blue: false,
                blueViolet: false,
                violet: true,
                violetRed: false,
            },
        }).then((res) => {
            console.log(res.data);
            setImages(res.data.images);
        });
    }

    const handleClick = () => {
        refineSearch();
    }

    const handleTest = () => {
        console.log(images);
    }
    
    return (
        <>
        <button onClick={() => handleClick()} >Refine Search</button>
        <button onClick={() => handleTest()} >Log Displayed Images</button>
        <FilterContainer filters={filterList} setFilterList={setFilterList} />
        <ResultList images={images} />
        </>
    )
}

export default ContentContainer;