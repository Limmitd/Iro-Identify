const os = require("os");
const path = require("path");
const fs = require("fs");
const functions = require("firebase-functions");
const spawn = require("child-process-promise").spawn;
const cors = require("cors")({origin: true});
const Busboy = require("busboy");
const UUID = require("uuid-v4");
const sizeOf = require("image-size");
const getColors = require('get-image-colors');
const { Storage } = require("@google-cloud/storage");
const { Datastore } = require('@google-cloud/datastore');

// using HSL values, similarity range is the +- value for the L value to find similar colors
const SimilarityRange = 15;

const pathToGcKey = "iro-identifier-firebase-adminsdk-i96zj-6e4002e6a4.json";
const gcs = new Storage({
    projectId: "iro-identifier",
    keyFilename: pathToGcKey
});
const datastore = new Datastore({
    keyFilename: pathToGcKey
});

const newDbImage = async (owner, name, type, url, thumbnailUrl, width, height, colors) => {
    const kind = "Image";
    const key = datastore.key(kind);
    
    const imageName = path.parse(name).name;

    const ratio = width/height;
    
    const image = {
        owner: owner,
        name: imageName,
        type: type,
        url: url,
        thumbnailUrl: thumbnailUrl,
        width: width,
        height: height,
        aspectRatio: ratio,
        colors: colors,
        objects: [],
    }

    const entity = {
        key: key,
        data: image,
    }

    return datastore.save(entity);
}

exports.onImageUpload = functions.storage.object().onFinalize(event => {
    const bucket = event.bucket;
    const contentType = event.contentType;
    const filepath = event.name;
    console.log("File detected");

    if (path.basename(filepath).startsWith("iro-thumbnail-")) {
        return true;
    }

    const originalInfo = event.metadata;
    const size = originalInfo.size;
    const splitSize = size.split("x");
    const owner = originalInfo.owner;
    const destBucket = gcs.bucket(bucket);
    const tmpFilepath = path.join(os.tmpdir(), path.basename(filepath));
    const uuid = UUID();
    const metadata = { 
        contentType, 
        metadata: {
            contentType,
            owner: owner,
            firebaseStorageDownloadTokens: uuid, 
        }
    }

    const original = destBucket.file(filepath);
    let originalUrl = null;
    let thumbnailUrl = null;
    let colors = [];

    let promises = [];

    // download original image into system tmp
    return destBucket.file(filepath).download({
        destination: tmpFilepath,
    }).then(() => {
        // analyze image colors
        promises.push(getColors(tmpFilepath, {count: 3}).then((colorResults) => {
            for (color of colorResults) {
                colors.push(Math.round(color.hsl()[0]));
            }
            return true;
        }));
        // get access url for original image
        promises.push(original.getSignedUrl({action: "read", expires: "12-31-2490"}).then((url) => {originalUrl = url; return true;}));
        // resize original image for thumbnail, reupload, then get its access url
        promises.push(spawn("convert", [tmpFilepath, "-resize", "500x500", tmpFilepath]).then(() => {
            return destBucket.upload(tmpFilepath, {
                destination: path.join(owner, "thumbnails", ('iro-thumbnail-' + path.basename(filepath))),
                metadata: metadata
            });
        }).then(() => {
            return destBucket.file(path.join(owner, "thumbnails", ('iro-thumbnail-' + path.basename(filepath)))).getSignedUrl({
                action: "read",
                expires: "12-31-2490"
            });
        }).then((url) => {thumbnailUrl = url; return true;}));
    }).then(() => {
        // create DB entry once all promises are resolved
        return Promise.all(promises).then(() => {
            return newDbImage(owner, path.basename(filepath), contentType, originalUrl, thumbnailUrl, parseInt(splitSize[0]), parseInt(splitSize[1]), colors);
        }).then(() => {
            console.log(`Saved ${path.basename(filepath)} to database.`);
            return true;
        }).catch((err) => {
            console.error(`Error on Finalize: ${err}`);
            return false;
        });
    }).catch((err) => {
        console.error(`Error: ${err}`);
        return false;
    });
});

exports.onImageDelete = functions.storage.object().onDelete(event => {
    const bucket = gcs.bucket(event.bucket);
    const owner = "guest";
    const filePath = event.name;
    const basename = path.basename(filePath);

    if (basename.startsWith("iro-thumbnail-")) {
        return true;
    }
    
    bucket.file(path.join(owner, "thumbnails", ('iro-thumbnail-' + basename))).delete();
    console.log("File was deleted...");

    const query = datastore.createQuery("Image").filter("owner", "=", owner).filter("name", "=", path.parse(basename).name);
    return datastore.runQuery(query).then((results) => {
        if (results) {
            datastore.delete(results[0][0][datastore.KEY]).then(() => {
                console.log(`Deleted database entry for ${basename}.`);
                return true;
            });
        } else {
            console.log(`No database entry found for ${basename} so there was no deletion.`);
            return false;
        }
    });
});

exports.uploadImages = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        if (req.method !== "POST") {
            return res.status(500).json({
                message: "Not allowed"
            });
        }
        const busboy = new Busboy({ headers: req.headers });
        let uploadData = [];
        busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
            const filepath = path.join(os.tmpdir(), filename);
            uploadData.push({file: filepath, type: mimetype});
            file.pipe(fs.createWriteStream(filepath));
        });

        busboy.on("finish", () => {
            const bucket = gcs.bucket("iro-identifier.appspot.com");
            const owner = "guest";
            let promises = [];
            uploadData.map(upload => {
                const uuid = UUID();
                const destination = path.join(owner, "images", path.basename(upload.file));

                const dimensions = sizeOf(upload.file);
                let width = dimensions.width;
                let height = dimensions.height;
                if ((dimensions.orientation === 6) || (dimensions.orientation === 8)) {
                    width = dimensions.height;
                    height = dimensions.width;
                }

                // upload current file to storage
                promises.push(bucket.upload(upload.file, {
                    destination: destination,
                    uploadType: "media",
                    metadata: {
                        contentType: upload.type,
                        metadata: {
                            size: `${width}x${height}`,
                            owner: owner,
                            firebaseStorageDownloadTokens: uuid
                        }
                    },
                    resumable: false
                }));
            });
            
            Promise.all(promises).then(() => {
                    res.status(200).json({
                        message: "Files uploaded successfully!"
                    });
                }).catch(err => {
                    res.status(500).json({
                    error: err
                });
            });
        });

        busboy.end(req.rawBody);
    });
});

const getImages = async () => {
    let images = [];
    const query = datastore.createQuery("Image");
    return new Promise((resolve, reject) => {
        datastore.runQuery(query).then((results) => {
            images = results[0];
        }).then(() => {
            resolve(images);
        }).catch((err) => {
            reject(err);
        });
    });
}

const getImagesByOwner = async (owner) => {
    let images = [];
    const query = datastore.createQuery("Image").filter("owner", "=", owner);
    return new Promise((resolve, reject) => {
        datastore.runQuery(query).then((results) => {
            images = results[0];
        }).then(() => {
            resolve(images);
        }).catch((err) => {
            reject(err);
        });
    });
}

const isSimilarColor = (match, check, range) => {
    if ((match - range) < 0) {
        if (((check >= 0) && (check <= range + match)) || 
                ((check >= (360 - (range - match))) && (check <= 360))) {
            return true;
        } else {
            return false;
        }

    } else if ((match + range) > 360) {
        if (((check >= 0) && (check <= ((match + range) - 360))) || 
                ((check >= (match - range)) && (check <= 360))) {
            return true;
        } else {
            return false;
        }

    } else {
        if ((check >= (match - range)) && (check <= (match + range))) {
            return true;
        } else {
            return false;
        }
    }
}

const getImagesByColor = async (colors) => {
    let queries = [];
    let promises = [];

    let images = [];
    let idSet = new Set();
    let currColor = colors[0];

    if ((currColor - SimilarityRange) < 0) {
        queries.push(datastore.createQuery("Image").filter("colors", ">=", 0).filter("colors", "<=", (SimilarityRange + currColor)));
        queries.push(datastore.createQuery("Image").filter("colors", ">=", (360 - (SimilarityRange - currColor))).filter("colors", "<=", 360));

    } else if ((currColor + SimilarityRange) > 360) {
        queries.push(datastore.createQuery("Image").filter("colors", ">=", 0).filter("colors", "<=", ((currColor + SimilarityRange) - 360)));
        queries.push(datastore.createQuery("Image").filter("colors", ">=", (currColor - SimilarityRange)).filter("colors", "<=", 360));

    } else {
        queries.push(datastore.createQuery("Image").filter("colors", ">=", (currColor - SimilarityRange)).filter("colors", "<=", (currColor + SimilarityRange)));
    }

    // forms collection matching first color
    queries.map((query) => {
        promises.push(datastore.runQuery(query).then((results) => {
            for (image of results[0]) {
                if (!idSet.has(image[datastore.KEY].id)) {
                    idSet.add(image[datastore.KEY].id);
                    images.push(image);
                }
            }
            return true;
        }));
    });

    return new Promise((resolve, reject) => {
        Promise.all(promises).then(() => {
            // filters images to images containing all given colors
            for (let i=0; i<colors.length-1; i++) {
                currColor = colors[i+1];
                // filters image set for current color
                images = images.filter((image) => {
                    let match = false;
                    // checks each color of image for similarity to current color
                    for (let j=0; j<image.colors.length; j++) {
                        match = isSimilarColor(currColor, image.colors[j], SimilarityRange);
                        if (match) {
                            break;
                        } 
                    }
                    return match;
                });
            }
        }).then(() => {
            resolve(images);
        }).catch((err) => {
            reject(err);
        });
    });
}

const refineByColor = (imageSet, colors) => {
    images = imageSet.slice();
    // filters images to images containing all given colors
    for (let i=0; i<colors.length; i++) {
        currColor = colors[i];
        // filters image set for current color
        images = images.filter((image) => {
            let match = false;
            // checks each color of image for similarity to current color
            for (let j=0; j<image.colors.length; j++) {
                match = isSimilarColor(currColor, image.colors[j], SimilarityRange);
                if (match) {
                    break;
                } 
            }
            return match;
        });
    }
    return images;
}

const getImageByObject = async (objects) => {

}

const refineByObject = (images, objects) => {

}

exports.getImages = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        if (req.method !== "POST") {
            return res.status(500).json({
                message: "Not allowed"
            });
        }

        let owner = null;
        let colors = null;
        let objects = null;
        // priority is used in case both conditions of images with colors and objects cannot be matched, it will return results from at least the priority
        let priority = null;
        let bothFulfilled = false;

        if (req.body.filterByOwner) {
            owner = req.body.owner;
        }
        if (req.body.colors) {
            colors = req.body.colors;
        }
        if (req.body.objects) {
            objects = req.body.objects;
        }
        if (req.body.priority) {
            priority = req.body.priority;
        }

        let images = [];
        let promises = [];

        // chooses way to query the database
        if (owner) {
            promises.push(getImagesByOwner(owner).then((results) => {
                images = results;
            }))
        } else if (priority) {
            if (priority === "objects") {
                promises.push(getImagesByObject(objects).then((results) => {
                    images = results;
                }));
            } else {
                promises.push(getImagesByColor(colors).then((results) => {
                    images = results;
                }));
            }
        } else if (colors) {
            promises.push(getImagesByColor(colors).then((results) => {
                images = results;
            }));
        } else if (objects) {
            promises.push(getImagesByObject(objects).then((results) => {
                images = results;
            }));
        } else {
            promises.push(getImages().then((results) => {
                images = results;
            }));
        }

        Promise.all(promises).then(() => {
            // these are all refining the original search to meet all conditions
            // if the owner was passed
            if (owner) {
                // checks if a priority is set and there are colors AND objects passed
                if (priority && colors && objects) {
                    // refines by objects then colors
                    if (priority === "objects") {
                        images = refineByObject(objects);
                        if (colors) {
                            const results = refineByColor(colors);
                            if (results.length > 0) {
                                images = results;
                                bothFulfilled = true;
                            }
                        }
                    // refines by colors then objects
                    } else {
                        images = refineByColor(colors);
                        if (objects) {
                            const results = refineByObject(objects);
                            if (results.length > 0) {
                                images = results;
                                bothFulfilled = true;
                            }
                        }
                    }
                // owner and colors are passed
                } else if (colors) {
                    images = refineByColor(colors);
                    // objects are also passed
                    if (objects) {
                        const results = refineByObject(objects);
                        if (results.length > 0) {
                            images = results;
                            bothFulfilled = true;
                        }
                    }
                // only owner and objects are passed
                } else if (objects) {
                    images = refineByObject(objects);
                }
            // no owner is passed
            } else {
                if (priority && colors && objects) {
                    // refines by objects then colors
                    if (priority === "objects") {
                        if (colors) {
                            const results = refineByColor(colors);
                            if (results.length > 0) {
                                images = results;
                                bothFulfilled = true;
                            }
                        }
                    // refines by colors then objects
                    } else {
                        if (objects) {
                            const results = refineByObject(objects);
                            if (results.length > 0) {
                                images = results;
                                bothFulfilled = true;
                            }
                        }
                    }
                // colors and objects are both passed with no priority
                } else if (colors && objects) {
                    const results = refineByObject(objects);
                    if (results.length > 0) {
                        images = results;
                        bothFulfilled = true;
                    }
                }
            }
        }).then(() => {
            if (priority) {
                res.status(200).json({
                    images: images,
                    bothFulfilled: bothFulfilled,
                });
            } else {
                res.status(200).json({
                    images: images,
                });
            }
        }).catch((err) => {
            res.status(500).json({
                error: err,
            });
        });
    });
});
