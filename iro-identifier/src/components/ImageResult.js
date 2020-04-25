import React from 'react';

const ImageResult = ({ image }) => {

    return(
        <a href={image.url}><img src={image.thumbnailUrl} alt={image.name} /></a>
    )
}

export default ImageResult;