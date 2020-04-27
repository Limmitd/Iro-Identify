# Iro-Identifier
A web-page that identifies primary colors within images and allows them to be filtered by primary colors.

### What Works so Far:
* Images can be sent from the page and saved to Google Cloud Storage.
* Once uploaded, the a thumbnail is created and stored and image colors and labels are processed.
* Once processing is done, a database entry is made that stores the owner, image name, dimensions, aspect ratio, colors, labels, and access urls for both the original image and the created thumbnail.
* Upon loading the main page, all images from the database are loaded and displayed.
* A request can be made to change the images displayed to match a set of colors, labels, and owner.
  * A priority can be set to either prioritize colors or labels and if there are no results for both, returns the results for the first instead.
  * If no owner is selected, shows images from entire database.
* Images can't be deleted from the app yet, but if the main photo is directly deleted, the thumbnail and the database entry is deleted.

### Things to Do Still:
* Add authentication so users can upload images and filter images within their own uploaded images
* Right now image colors are found using the get-image-colors node package, and I might create my own way to find colors so that it is more adjustable
* Need to hone in on a maxDeltaE value to use for color matching
* Last but not least, the actual front-end needs to be almost entirely created, but I'm waiting to finish the backend for the most part