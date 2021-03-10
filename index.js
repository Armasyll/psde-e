const Tools = require('./Tools.js');
const { app, BrowserWindow } = require('electron');
const extract = require('extract-zip');
const fse = require('fs-extra');
//const https = require('https');
const https = require('follow-redirects').https;
const __ROOT__ = String(app.getAppPath()).replace(/\/resources\/app/, "");
const __GAME__ = String(__ROOT__).concat("/resources/html");

app.commandLine.appendSwitch("ignore-gpu-blocklist", true);
app.commandLine.appendSwitch("enable-gpu-rasterization", true);
app.commandLine.appendSwitch("enable-accelerated-video-decode", true);

class GameWrapper {
    static initialize() {
        if (GameWrapper.initialized) {
            return 1;
        }
        GameWrapper.initialized = false;
        GameWrapper.gamePath = __GAME__;
        GameWrapper.downloadPath = String(__ROOT__).concat("/resources/archives");
        GameWrapper.createdWindow = false;
        GameWrapper.closing = false;
        GameWrapper.callbacks = {};

        GameWrapper.sGitOwner = String("armasyll");
        GameWrapper.sGitRepo = String("psde");
        GameWrapper.sGitApiPath = String(`/repos/${GameWrapper.sGitOwner}/${GameWrapper.sGitRepo}`);
        GameWrapper.sGitApiUrn = String("api.github.com").concat(GameWrapper.sGitApiPath);
        GameWrapper.window = null;
        GameWrapper.lastVersion = String("");
        GameWrapper.initialized = true;

        GameWrapper.parseArguments(process.argv);

        GameWrapper.applyLatestCommit();

        if (!GameWrapper.closing) {
            app.whenReady().then(GameWrapper.createWindow);
        }
        return 0;
    }

    /**
     * 
     * @param {string} id Callback ID
     * @param {(string|undefined)} parentID ID of parent callback, if any
     * @param {function} callback Function to call
     * @param {object} params Params to pass
     */
    static createCallback(id = "", parentID = null, params = [], callback = null) {
        id = Tools.filterID(id, Tools.genUUIDv4());
        if (!(params instanceof Array)) {
            params = [params];
        }
        GameWrapper.callbacks[id] = {"parent":parentID, "params":params, "callback":callback, "hasRun":false, "status":0};
        return id;
    }
    /**
     * 
     * @param {string} id Callback ID
     */
    static removeCallback(id) {
        delete GameWrapper.callbacks[id]["parent"];
        delete GameWrapper.callbacks[id]["params"];
        delete GameWrapper.callbacks[id]["callback"];
        delete GameWrapper.callbacks[id]["hasRun"];
        delete GameWrapper.callbacks[id];
        return 0;
    }
    /**
     * 
     * @param {string} id Callback ID
     */
    static getCallback(id) {
        if (GameWrapper.callbacks.hasOwnProperty(id)) {
            return GameWrapper.callbacks[id];
        }
        return 1;
    }
    static getCallbacks(parent = null, callback = null, hasRun = null, status = null) {
        let obj = {};
        for (let entry in GameWrapper.callbacks) {
            if (
                (parent == null || parent == GameWrapper.callbacks[entry]["parent"]) &&
                (callback == null || callback == GameWrapper.callbacks[entry]["callback"]) &&
                (hasRun == null || hasRun == GameWrapper.callbacks[entry]["hasRun"]) &&
                (status == null || status == GameWrapper.callbacks[entry]["status"])
            ) {
                obj[entry] = GameWrapper.callbacks[entry];
            }
        }
        return obj;
    }
    static hasCallback(id) {
        return GameWrapper.callbacks.hasOwnProperty(id);
    }
    /**
     * 
     * @param {string} id 
     * @param {(object|null)} [response] 
     * @param {boolean} [flipRun] Check and flip run boolean
     */
    static runCallback(id, response = null, flipRun = true, recursive = false) {
        if (!GameWrapper.hasCallback(id)) {
            return 1;
        }
        let callback = GameWrapper.getCallback(id);
        if (!callback["hasRun"]) {
            if (typeof callback["callback"] == "function") {
                if (callback["params"] instanceof Array && callback["params"].length == 1 && callback["params"][0] == null) {
                    callback["callback"](response, id);
                }
                else {
                    callback["callback"](...callback["params"], response, id);
                }
            }
            if (flipRun) {
                callback["hasRun"] = true;
            }
        }
        if (recursive) {
            GameWrapper.runCallback(callback["parent"], response, flipRun, recursive)
        }
        return 0;
    }
    /**
     * 
     * @param {string} id 
     * @param {(object|null)} [response] 
     */
    static runCallbackParent(id, response = null) {
        if (GameWrapper.callbacks.hasOwnProperty(id)) {
            if (GameWrapper.callbacks.hasOwnProperty(GameWrapper.callbacks[id]["parent"])) {
                GameWrapper.runCallback(GameWrapper.callbacks[id]["parent"], response);
            }
        }
        return 0;
    }
    /**
     * 
     * @param {string} id 
     */
    static hasRunCallback(id) {
        return GameWrapper.callbacks.hasOwnProperty(id) && GameWrapper.callbacks[id]["hasRun"] === true;
    }
    /**
     * 
     * @param {string} id 
     * @param {boolean} [hasRun] Check and flip run boolean
     */
    static setHasRunCallback(id, hasRun = true) {
        if (GameWrapper.hasCallback(id)) {
            GameWrapper.getCallback(id)["hasRun"] = (hasRun === true);
        }
        return 0;
    }
    static purgeCallbacks() {
        for (let callbackID in GameWrapper.callbacks) {
            if (GameWrapper.callbacks[callbackID].hasRun) {
                GameWrapper.removeCallback(callbackID);
            }
        }
        return 0;
    }

    static createWindow() {
        if (!GameWrapper.initialized) {
            return 1;
        }
        if (GameWrapper.createdWindow) {
            return 0;
        }
        GameWrapper.createdWindow = true;
        GameWrapper.window = new BrowserWindow({
            "width": 1024,
            "height": 768,
            "webPreferences": {
                "nodeIntegration": true
            }
        });

        GameWrapper.window.loadFile(GameWrapper.gamePath.concat("/index.html"));
        GameWrapper.window.removeMenu();
        app.on("window-all-closed", GameWrapper.closeWindow);
        app.on("activate", GameWrapper.activateWindow);
        return 0;
    }
    static closeWindow() {
        if (process.platform !== 'darwin') {
            app.quit();
        }
        return 0;
    }
    static activateWindow() {        
        if (BrowserWindow.getAllWindows().length === 0) {
            GameWrapper.createWindow();
        }
        return 0;
    }

    static parseArguments(argv) {
        if (argv.length == 0) {
            return 0;
        }
        let i = 1;
        while (i <= argv.length) {
            switch (argv[i]) {
                case "--gamePath": {
                    i++;
                    GameWrapper.gamePath = String(argv[i]);
                    break;
                }
                case "--dontCreateWindow": {
                    GameWrapper.createdWindow = true;
                    break;
                }
                case "-h":
                case "--help": {
                    console.log("Usage:");
                    console.log(`  ${argv[0].replace(/.*[\/,\\]/g, "")} [OPTION...]`);
                    console.log("");
                    console.log("Run the game wrapper for PSDE");
                    console.log("");
                    console.log("Help Options:");
                    console.log("  -h, --help            Show help options.");
                    console.log("  --gamePath            Change default path PSDE is loaded from.");
                    console.log("  --dontCreateWindow    Don't create game window. (Only for debugging.)");
                    console.log("");
                    GameWrapper.closing = true;
                    app.quit();
                    break;
                }
            }
            i += 1;
        }
        return 0;
    }

    static getRepo() {
        return 0;
    }
    static getCommits(per_page = 30, page = 1) {
        return 0;
    }
    static getReleases() {
        return 0;
    }
    static testOnline() {
        return 0;
    }
    static getRelease(sha = "") {
        return 0;
    }
    static downloadRelease(sha = "", to = "./") {
        return 0;
    }
    static getCommit(sha = "") {
        return 0;
    }
    static getLatestCommit(parentCallbackID = "") {
        console.log(`Running GameWrapper.getLatestCommit(${parentCallbackID})`);
        GameWrapper.getRemoteJSON(GameWrapper.sGitApiPath.concat("/commits"), GameWrapper.getLatestCommitPhaseTwo, GameWrapper.getLatestCommitFailed, parentCallbackID);
        return 0;
    }
    static getLatestCommitPhaseTwo(response, parentCallbackID = "") {
        console.log(`Running GameWrapper.getLatestCommitPhaseTwo({Object}, ${parentCallbackID})`);
        GameWrapper.runCallback(parentCallbackID, response[0]["sha"]);
        return 0;
    }
    static getLatestCommitFailed(e) {
        return 0;
    }
    static getRemoteJSON(path = "", callbackSuccess = null, callbackFail = null, parentCallbackID = "") {
        console.log(`Running GameWrapper.getRemoteJSON(${path}, ${typeof callbackSuccess}, ${typeof callbackFail}, ${parentCallbackID})`);
        let httpOptions = {
            "host": 'api.github.com',
            "path": path,
            "port": '443',
            "method": 'GET',
            "headers": {
                "User-Agent": 'Lemme in pls :v',
                "Content-Type": 'application/json'
            }
        };
        let buffer = [];
        let httpsRequest = https.request(httpOptions, (incomingMessage, followResponse) => {
            if (incomingMessage.statusCode !== 200) {
                // TODO: error handling
            }
            else {
                incomingMessage.setEncoding("utf8");
                incomingMessage.on("data", chunk => {
                    buffer.push(Buffer.from(chunk));
                }).on("end", () => {
                    if (typeof callbackSuccess == "function") {
                        callbackSuccess(JSON.parse(Buffer.concat(buffer).toString()), parentCallbackID);
                    }
                }).on("error", (error) => {
                    if (typeof callbackFail == "function") {
                        callbackFail(error);
                    }
                });
            }
        });
        httpsRequest.on('error', (error) => {
            if (typeof callbackFail == "function") {
                callbackFail(error);
            }
        });
        httpsRequest.end();
        return 0;
    }

    static cacheCommit() {}
    static removeGameDirectory(callback = GameWrapper.testGameDirectory) {
        fse.remove(GameWrapper.gamePath)
            .then(callback)
            .catch(GameWrapper.removeGameDirectoryFailed);
        return 0;
    }
    static removeGameDirectoryFailed(e) {
        return 0;
    }
    static createGameDirectory(callback = GameWrapper.testGameDirectory) {
        fse.ensureDir(GameWrapper.gamePath)
            .then(callback)
            .catch(GameWrapper.createGameDirectoryFailed);
        return 0;
    }
    static createGameDirectoryFailed(e) {
        return 0;
    }
    static testGameDirectory() {
        return fse.existsSync(GameWrapper.gamePath);
    }
    static createDownloadDirectory(callback = GameWrapper.testDownloadDirectory) {
        fse.ensureDir(GameWrapper.downloadPath)
            .then(callback)
            .catch(GameWrapper.createDownloadDirectoryFailed);
        return 0;
    }
    static createDownloadDirectoryFailed(e) {
        return 0;
    }
    static testDownloadDirectory() {
        return fse.existsSync(GameWrapper.downloadPath);
    }
    static downloadCommit(sha = "", callbackID) {
        sha = String(sha);
        let fileName = sha.concat(".zip");
        let fileUrl = String(`https://github.com/${GameWrapper.sGitOwner}/${GameWrapper.sGitRepo}/archive/${sha}.zip`);
        GameWrapper.downloadFile(fileUrl, fileName, callbackID);
        return 0;
    }
    static downloadFile(url, fileName, callbackID) {
        console.log(`Running GameWrapper.downloadFile(${url}, ${fileName})`)
        let filePath = GameWrapper.downloadPath.concat("/").concat(fileName);
        if (fse.existsSync(filePath)) {
            GameWrapper.runCallback(callbackID, fileName);
            return 0;
        }
        let file = fse.createWriteStream(filePath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on("finish", (e) => {
                file.close((f) => {
                    GameWrapper.runCallback(callbackID, fileName);
                });  // close() is async, call cb after close completes.
            });
        }).on("error", GameWrapper.downloadFileFailed);
        return 0;
    }
    static downloadFileFailed(e) {
        return 0;
    }
    static extractZip(file, dest = __GAME__, parentCallbackID) {
        try {
            extract(GameWrapper.downloadPath.concat("/").concat(file), { "dir": dest }, (e) => {
                GameWrapper.runCallback(parentCallbackID, true);
            });
        }
        catch (e) {
            GameWrapper.extractZipFailed(e);
        }
        return 0;
    }
    static extractZipFailed(e) {
        return 0;
    }
    static applyCommit(sha, parentCallbackID = "") {
        console.log(`Running GameWrapper.applyCommit(${sha}, ${parentCallbackID})`);
        if (!GameWrapper.testDownloadDirectory()) {
            GameWrapper.createDownloadDirectory();
        }
        GameWrapper.applyCommitPhaseTwo(sha, parentCallbackID);
        return 0;
    }
    /**
     * Creates download and game directories, downloads commit, and extracts commit
     * @param {string} sha 
     * @param {(string|null)} parentCallbackID 
     */
    static applyCommitPhaseTwo(sha, parentCallbackID = "") {
        console.log(`Running GameWrapper.applyCommitPhaseTwo(${sha}, ${parentCallbackID})`);
        sha = Tools.filterID(sha);
        parentCallbackID = Tools.filterID(parentCallbackID);
        let callbackID = Tools.genUUIDv4();
        GameWrapper.createCallback(callbackID, parentCallbackID, [sha], GameWrapper.applyCommitPhaseThree);
        GameWrapper.downloadCommit(sha, callbackID);
        return 0;
    }
    static applyCommitPhaseThree(sha, response, parentCallbackID) {
        console.log(`Running GameWrapper.applyCommitPhaseThree(${sha}, ${response}, ${parentCallbackID})`);
        if (GameWrapper.testGameDirectory()) {
            GameWrapper.removeGameDirectory();
        }
        GameWrapper.applyCommitPhaseFour(sha, response, parentCallbackID);
        return 0;
    }
    /**
     * 
     * @param {string} sha 
     * @param {string} response Destination, hopefully.
     * @param {(string|null)} parentCallbackID 
     */
    static applyCommitPhaseFour(sha, response, parentCallbackID) {
        console.log(`Running GameWrapper.applyCommitPhaseFour(${sha}, ${response}, ${parentCallbackID})`);
        sha = Tools.filterID(sha);
        parentCallbackID = Tools.filterID(parentCallbackID);
        let callbackID = Tools.genUUIDv4();
        GameWrapper.createCallback(callbackID, parentCallbackID, [sha, response], GameWrapper.applyCommitPhaseFive);
        GameWrapper.extractZip(response, __ROOT__.concat("/resources"), callbackID);
        return 0;
    }
    /**
     * 
     * @param {string} sha 
     * @param {string} dest 
     * @param {boolean} response 
     * @param {string} parentCallbackID 
     */
    static applyCommitPhaseFive(sha, dest, response, parentCallbackID) {
        console.log(`Running GameWrapper.applyCommitPhaseFive()`);
        let sFrom = __ROOT__.concat("/resources/").concat(GameWrapper.sGitRepo).concat("-").concat(sha);
        fse.moveSync(sFrom, GameWrapper.gamePath);
        return 0;
    }
    static applyLatestCommit() {
        let callbackID = Tools.genUUIDv4();
        GameWrapper.createCallback(callbackID, null, null, GameWrapper.applyCommit);
        GameWrapper.getLatestCommit(callbackID);
        return 0;
    }
}
GameWrapper.initialize();