import React, { useState } from 'react';
import FilterContainer from './FilterContainer';
import ResultList from './ResultList';


const ContentContainer = (props) => {
    const [filterList, setFilterList] = useState({filters: []});

    const images = [
        {
            name: "website1.jpg",
            url: "https://firebasestorage.googleapis.com/v0/b/iro-identifier.appspot.com/o/images%2Fwebsite1.jpg?alt=media&token=bc0765fe-d180-4dd3-9d62-9498a6bf7417",
            thumbnailUrl: "https://firebasestorage.googleapis.com/v0/b/iro-identifier.appspot.com/o/thumbnails%2Firo-thumbnail-website1.jpg?alt=media&token=c7349cd3-b216-4447-8eea-493b629620c2",
        }, {
            name: "website2.jpg",
            url: "https://firebasestorage.googleapis.com/v0/b/iro-identifier.appspot.com/o/images%2Fwebsite2.jpg?alt=media&token=35e81284-1b3b-4839-99ee-c18887be0f87",
            thumbnailUrl: "https://firebasestorage.googleapis.com/v0/b/iro-identifier.appspot.com/o/thumbnails%2Firo-thumbnail-website2.jpg?alt=media&token=6b3925c6-d68e-49db-95a6-5b509d9907de",
        }, {
            name: "website3.jpg",
            url: "https://firebasestorage.googleapis.com/v0/b/iro-identifier.appspot.com/o/images%2Fwebsite3.jpg?alt=media&token=89aebd85-d75c-4e06-9b1e-b6d6fa7d7523",
            thumbnailUrl: "https://firebasestorage.googleapis.com/v0/b/iro-identifier.appspot.com/o/thumbnails%2Firo-thumbnail-website3.jpg?alt=media&token=96c4c3a6-4173-45be-bbe6-c02971e5fad7",
        }
    ]
    
    return (
        <>
        <FilterContainer filters={filterList} setFilterList={setFilterList} />
        <ResultList images={images} />
        </>
    )
}

export default ContentContainer;