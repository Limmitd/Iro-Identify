const os = require("os");
const path = require("path");
const fs = require("fs");
const functions = require("firebase-functions");
const spawn = require("child-process-promise").spawn;
const cors = require("cors")({origin: true});
const Busboy = require("busboy");
const UUID = require("uuid-v4");
const { Storage } = require("@google-cloud/storage");
let gcs = new Storage({
    projectId: "iro-identifier",
    keyFilename: "iro-identifier-firebase-adminsdk-i96zj-6e4002e6a4.json"
});

exports.onImageUpload = functions.storage.object().onFinalize(event => {
    console.log(event);
    const bucket = event.bucket;
    const contentType = event.contentType;
    const filePath = event.name;
    console.log("File detected");

    if (path.basename(filePath).startsWith("thumbnail-")) {
        console.log("Already resized this file!");
        return true;
    }

    const destBucket = gcs.bucket(bucket);
    const tmpFilePath = path.join(os.tmpdir(), path.basename(filePath));
    const uuid = UUID();
    const metadata = { contentType, metadata: { firebaseStorageDownloadTokens: uuid }};

    return destBucket.file(filePath).download({
        destination: tmpFilePath
    }).then(() => {
        return spawn("convert", [tmpFilePath, "-resize", "500x500", tmpFilePath]);
    }).then(() => {
        return destBucket.upload(tmpFilePath, {
            destination: 'thumbnail-' + path.basename(filePath),
            metadata: metadata
        });
    }).then(_ => true);
});

exports.onImageDelete = functions.storage.object().onDelete(event => {
    console.log(event);
    const bucket = gcs.bucket(event.bucket);
    const filePath = event.name;
    console.log("File was deleted...");

    if (path.basename(filePath).startsWith("thumbnail-")) {
        console.log("Thumbnail already deleted");
        return true;
    }
    
    bucket.file("thumbnail-" + path.basename(filePath)).delete();
    return true;
});

exports.uploadFile = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        if (req.method !== "POST") {
            return res.status(500).json({
                message: "Not allowed"
            })
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
            let promises = [];
            promises.push(uploadData.map(upload => {
                const uuid = UUID();
                bucket.upload(upload.file, {
                    uploadType: "media",
                    metadata: {
                        metadata: {
                            contentType: upload.type,
                            firebaseStorageDownloadTokens: uuid
                        }
                    },
                    resumable: false
                });
            }));
            
            Promise.all(promises).then((err, uploadedFile) => {
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
