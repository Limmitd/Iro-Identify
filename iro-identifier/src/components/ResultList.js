import React from 'react';
import ImageResult from './ImageResult';

const ResultList = ({images}) => {

    return (
        <>
        {images.map((image, key) => (
            <ImageResult image={image} key={key}/>
        ))}
        </>
    )
}

export default ResultList;