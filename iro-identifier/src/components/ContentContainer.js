import React, { useState, useEffect } from 'react';
import FilterContainer from './FilterContainer';
import ResultList from './ResultList';


const ContentContainer = (props) => {
    const [filterList, setFilterList] = useState({filters: []});
    
    return (
        <>
        <FilterContainer filters={filterList} setFilterList={setFilterList} />
        <ResultList images={images} />
        </>
    )
}

export default ContentContainer;