const os = require("os");
const path = require("path");
const fs = require("fs");
const functions = require("firebase-functions");
const spawn = require("child-process-promise").spawn;
const cors = require("cors")({origin: true});
const Busboy = require("busboy");
const UUID = require("uuid-v4");
const sizeOf = require("image-size");
const getColors = require("get-image-colors");
const DeltaE = require("delta-e");
const vision = require("@google-cloud/vision");
const { Storage } = require("@google-cloud/storage");
const { Datastore } = require("@google-cloud/datastore");

const pathToGcKey = "iro-identifier-firebase-adminsdk-i96zj-6e4002e6a4.json";
const visionClient = new vision.ImageAnnotatorClient({
    keyFilename: pathToGcKey
});
const gcs = new Storage({
    projectId: "iro-identifier",
    keyFilename: pathToGcKey
});
const datastore = new Datastore({
    keyFilename: pathToGcKey
});

const newDbImage = async (owner, name, type, url, thumbnailUrl, width, height, labels, colors) => {
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
        labels: labels,
        red: colors.red,
        redOrange: colors.redOrange,
        orange: colors.orange,
        orangeYellow: colors.orangeYellow,
        yellow: colors.yellow,
        yellowGreen: colors.yellowGreen,
        green: colors.green,
        greenBlue: colors.greenBlue,
        blue: colors.blue,
        blueViolet: colors.blueViolet,
        violet: colors.violet,
        violetRed: colors.violetRed,
    }

    const entity = {
        key: key,
        data: image,
    }

    return datastore.save(entity);
}

const findColorMatches = (imageColors) => {
    const maxDeltaE = 25;

    let colors = {
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
    }

    const red = {L: 53.239, A: 80.09, B: 67.201};
    const redOrange = {L: 57.58, A: 67.78, B: 68.957};
    const orange = {L: 74.935, A: 23.929, B: 78.949};
    const orangeYellow = {L: 77.238, A: 20.644, B: 64.452};
    const yellow = {L: 97.139, A: -21.558, B: 94.477};
    const yellowGreen = {L: 91.957, A: -52.483, B: 81.863};
    const green = {L: 46.228, A: -51.699, B: 49.897};
    const greenBlue = {L: 42.043, A: 7.594, B: -48.801};
    const blue = {L: 32.299, A: 79.191, B: -107.865};
    const blueViolet = {L: 42.188, A: 69.847, B: -74.771};
    const violet = {L: 69.695, A: 56.357, B: -36.819};
    const violetRed = {L: 44.766, A: 70.992, B: -15.176};

    for (color of imageColors) {
        colors.red = colors.red || DeltaE.getDeltaE00(red, color) < maxDeltaE;
        colors.redOrange = colors.redOrange || DeltaE.getDeltaE00(redOrange, color) < maxDeltaE;
        colors.orange = colors.orange || DeltaE.getDeltaE00(orange, color) < maxDeltaE;
        colors.orangeYellow = colors.orangeYellow || DeltaE.getDeltaE00(orangeYellow, color) < maxDeltaE;
        colors.yellow = colors.yellow || DeltaE.getDeltaE00(yellow, color) < maxDeltaE;
        colors.yellowGreen = colors.yellowGreen || DeltaE.getDeltaE00(yellowGreen, color) < maxDeltaE;
        colors.green = colors.green || DeltaE.getDeltaE00(green, color) < maxDeltaE;
        colors.greenBlue = colors.greenBlue || DeltaE.getDeltaE00(greenBlue, color) < maxDeltaE;
        colors.blue = colors.blue || DeltaE.getDeltaE00(blue, color) < maxDeltaE;
        colors.blueViolet = colors.blueViolet || DeltaE.getDeltaE00(blueViolet, color) < maxDeltaE;
        colors.violet = colors.violet || DeltaE.getDeltaE00(violet, color) < maxDeltaE;
        colors.violetRed = colors.violetRed || DeltaE.getDeltaE00(violetRed, color) < maxDeltaE;
    }

    return colors;
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
    let labels = [];
    let colors = [];

    let promises = [];

    // download original image into system tmp
    return destBucket.file(filepath).download({
        destination: tmpFilepath,
    }).then(() => {
        // analyze image labels
        promises.push(visionClient.labelDetection(tmpFilepath).then((labelResults) => {
            for (result of labelResults[0].labelAnnotations) {
                labels.push(result.description.toLowerCase());
            }
        }));
        // analyze image colors
        promises.push(getColors(tmpFilepath, {count: 3}).then((colorResults) => {
            let imageColors = [];
            for (color of colorResults) {
                let labRes = color.lab();
                let lab = {
                    L: labRes[0],
                    A: labRes[1],
                    B: labRes[2],
                }
                imageColors.push(lab);
            }
            colors = findColorMatches(imageColors);
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
            return newDbImage(owner, path.basename(filepath), contentType, originalUrl, thumbnailUrl, parseInt(splitSize[0]), parseInt(splitSize[1]), labels, colors);
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

const getImagesByColor = async (colors) => {
    let images = [];
    let query = datastore.createQuery("Image");

    if (colors.red) {query = query.filter("red", "=", true);}
    if (colors.redOrange) {query = query.filter("redOrange", "=", true);}
    if (colors.orange) {query = query.filter("orange", "=", true);}
    if (colors.orangeYellow) {query = query.filter("orangeYellow", "=", true);}
    if (colors.yellow) {query = query.filter("yellow", "=", true);}
    if (colors.yellowGreen) {query = query.filter("yellowGreen", "=", true);}
    if (colors.green) {query = query.filter("green", "=", true);}
    if (colors.greenBlue) {query = query.filter("greenBlue", "=", true);}
    if (colors.blue) {query = query.filter("blue", "=", true);}
    if (colors.blueViolet) {query = query.filter("blueViolet", "=", true);}
    if (colors.violet) {query = query.filter("violet", "=", true);}
    if (colors.violetRed) {query = query.filter("violetRed", "=", true);}

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

const refineByColor = (imageSet, colors) => {
    let images = imageSet.slice();

    if (colors.red) {images = images.filter((image) => {return image.red;})}
    if (colors.redOrange) {images = images.filter((image) => {return image.redOrange;})}
    if (colors.orange) {images = images.filter((image) => {return image.orange;})}
    if (colors.orangeYellow) {images = images.filter((image) => {return image.orangeYellow;})}
    if (colors.yellow) {images = images.filter((image) => {return image.yellow;})}
    if (colors.yellowGreen) {images = images.filter((image) => {return image.yellowGreen;})}
    if (colors.green) {images = images.filter((image) => {return image.green;})}
    if (colors.greenBlue) {images = images.filter((image) => {return image.greenBlue;})}
    if (colors.blue) {images = images.filter((image) => {return image.blue;})}
    if (colors.blueViolet) {images = images.filter((image) => {return image.blueViolet;})}
    if (colors.violet) {images = images.filter((image) => {return image.violet;})}
    if (colors.violetRed) {images = images.filter((image) => {return image.violetRed;})}
    
    return images;
}

const getImagesByLabel = async (labels) => {
    let images = [];
    let currLabel = labels[0];

    // query the first label
    const query = datastore.createQuery("Image").filter("labels", "=", currLabel);

    return new Promise((resolve, reject) => {
        datastore.runQuery(query).then((results) => {
            images = results[0];
            // filters images to images containing all given labels
            for (let i=0; i<labels.length-1; i++) {
                currLabel = labels[i+1];
                // filters image set for current color
                images = images.filter((image) => {
                    let match = false;
                    // checks each label of image for current label
                    for (let j=0; j<image.labels.length; j++) {
                        if (image.labels[j] === currLabel) {
                            match = true;
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

const refineByLabel = (imageSet, labels) => {
    let images = imageSet.slice();
    // filters images to images containing all given labels
    for (let i=0; i<labels.length; i++) {
        let currLabel = labels[i];
        // filters image set for current label
        images = images.filter((image) => {
            let match = false;
            // checks each label of image for current label
            for (let j=0; j<image.labels.length; j++) {
                if (image.labels[j] === currLabel) {
                    match = true;
                    break;
                }
            }
            return match;
        });
    }
    return images;
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
        // using HSL values, similarity range is the +- value for the H value to find similar colors
        let similarityRange = 10

        let labels = null;

        // priority is used in case both conditions of images with colors and labels cannot be matched, it will return results from at least the priority
        let priority = null;
        let bothFulfilled = false;

        if (req.body.owner) {
            owner = req.body.owner;
        }
        if (req.body.colors) {
            colors = req.body.colors;
        }
        if (req.body.similarityRange) {
            similarityRange = req.body.similarityRange;
        }
        if (req.body.labels) {
            labels = req.body.labels;
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
            if (priority === "labels") {
                promises.push(getImagesByLabel(labels).then((results) => {
                    images = results;
                }));
            } else {
                promises.push(getImagesByColor(colors).then((results) => {
                    images = results;
                }));
            }
        } else if (colors) {
            promises.push(getImagesByColor(colors, similarityRange).then((results) => {
                images = results;
            }));
        } else if (labels) {
            promises.push(getImagesByLabel(labels).then((results) => {
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
                // checks if a priority is set and there are colors AND labels passed
                if (priority && colors && labels) {
                    // refines by labels then colors
                    if (priority === "labels") {
                        images = refineByLabel(images, labels);
                        if (colors) {
                            const results = refineByColor(images, colors, similarityRange);
                            if (results.length > 0) {
                                images = results;
                                bothFulfilled = true;
                            }
                        }
                    // refines by colors then labels
                    } else {
                        images = refineByColor(images, colors, similarityRange);
                        if (labels) {
                            const results = refineByLabel(images, labels);
                            if (results.length > 0) {
                                images = results;
                                bothFulfilled = true;
                            }
                        }
                    }
                // owner and colors are passed
                } else if (colors) {
                    images = refineByColor(images, colors, similarityRange);
                    // labels are also passed
                    if (labels) {
                        const results = refineByLabel(images, labels);
                        if (results.length > 0) {
                            images = results;
                            bothFulfilled = true;
                        }
                    }
                // only owner and labels are passed
                } else if (labels) {
                    images = refineByLabel(images, labels);
                }
            // no owner is passed
            } else {
                if (priority && colors && labels) {
                    // refines by labels then colors
                    if (priority === "labels") {
                        if (colors) {
                            const results = refineByColor(images, colors, similarityRange);
                            if (results.length > 0) {
                                images = results;
                                bothFulfilled = true;
                            }
                        }
                    // refines by colors then labels
                    } else {
                        if (labels) {
                            const results = refineByLabel(images, labels);
                            if (results.length > 0) {
                                images = results;
                                bothFulfilled = true;
                            }
                        }
                    }
                // colors and labels are both passed with no priority
                } else if (colors && labels) {
                    const results = refineByLabel(images, labels);
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
