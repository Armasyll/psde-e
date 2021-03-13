const path = require('path');
const Tools = require('./Tools.js');
const { app, BrowserWindow } = require('electron');
const extract = require('extract-zip');
const fse = require('fs-extra');
//const https = require('https');
const https = require('follow-redirects').https;
const __ROOT__ = path.dirname(process.execPath);
const __RES__ = path.resolve(__ROOT__, 'resources');
const __APP__ = path.resolve(__RES__, 'app');
const __GAME__ = path.resolve(__RES__, 'html');


app.commandLine.appendSwitch("ignore-gpu-blocklist", true);
app.commandLine.appendSwitch("enable-gpu-rasterization", true);
app.commandLine.appendSwitch("enable-accelerated-video-decode", true);

class GameWrapper {
    static initialize() {
        if (GameWrapper.initialized) {
            return 1;
        }
        GameWrapper.initialized = false;
        GameWrapper.hasGameFiles = false;
        GameWrapper.gamePath = __GAME__;
        GameWrapper.downloadPath = path.resolve(__RES__, 'archives');
        GameWrapper.createdWindow = false;
        GameWrapper.closing = false;
        GameWrapper.callbacks = {};

        GameWrapper.sGitOwner = String("armasyll");
        GameWrapper.sGitGameRepo = String("psde");
        GameWrapper.sGitGameApiPath = String(`/repos/${GameWrapper.sGitOwner}/${GameWrapper.sGitGameRepo}`);
        GameWrapper.sGitGameApiUrn = String("api.github.com").concat(GameWrapper.sGitGameApiPath);
        GameWrapper.sGitLauncherRepo = String("psde-e");
        GameWrapper.sGitLauncherApiPath = String(`/repos/${GameWrapper.sGitOwner}/${GameWrapper.sGitLauncherRepo}`);
        GameWrapper.sGitLauncherApiUrn = String("api.github.com").concat(GameWrapper.sGitLauncherApiPath);
        GameWrapper.window = null;
        GameWrapper.lastVersion = String("");
        GameWrapper.initialized = true;
        GameWrapper._launchIntervalID = null;

        GameWrapper.parseArguments(process.argv);

        if (GameWrapper.closing) {
            return 0;
        }
        GameWrapper.hasGameFiles = GameWrapper.testGameDirectory();
        if (!GameWrapper.hasGameFiles) {
            GameWrapper.applyLatestGameCommit();
        }
        GameWrapper.scheduleLaunch(2000);
        return 0;
    }

    static scheduleLaunch(interval = 2000) {
        GameWrapper._launchIntervalID = setInterval(() => {
            if (GameWrapper.hasGameFiles) {
                GameWrapper.unscheduleLaunch();
                app.whenReady().then(GameWrapper.createWindow);
            }
        }, interval);
        return 0;
    }
    static unscheduleLaunch() {
        clearInterval(GameWrapper._launchIntervalID);
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

        GameWrapper.window.loadFile(path.resolve(GameWrapper.gamePath, "index.html"));
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
                case "--update":
                case "-u": {
                    GameWrapper.applyLatestGameCommit();
                    GameWrapper.applyLatestLauncherCommit();
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

    static getGameCommits(per_page = 30, page = 1) {
        return 0;
    }
    static testOnline() {
        return 0;
    }
    static getLatestGameCommit(parentCallbackID = "") {
        console.log(`Running GameWrapper.getLatestGameCommit(${parentCallbackID})`);
        GameWrapper.getGitApiJSON(GameWrapper.sGitGameApiPath.concat("/commits"), GameWrapper.getLatestGameCommitPhaseTwo, GameWrapper.getLatestGameCommitFailed, parentCallbackID);
        return 0;
    }
    static getLatestGameCommitPhaseTwo(response, parentCallbackID = "") {
        console.log(`Running GameWrapper.getLatestGameCommitPhaseTwo({Object}, ${parentCallbackID})`);
        GameWrapper.runCallback(parentCallbackID, response[0]["sha"]);
        return 0;
    }
    static getLatestGameCommitFailed(e) {
        return 0;
    }
    static getLatestLauncherCommit(parentCallbackID = "") {
        console.log(`Running GameWrapper.getLatestLauncherCommit(${parentCallbackID})`);
        GameWrapper.getGitApiJSON(GameWrapper.sGitLauncherApiPath.concat("/commits"), GameWrapper.getLatestLauncherCommitPhaseTwo, GameWrapper.getLatestLauncherCommitFailed, parentCallbackID);
        return 0;
    }
    static getLatestLauncherCommitPhaseTwo(response, parentCallbackID = "") {
        console.log(`Running GameWrapper.getLatestLauncherCommitPhaseTwo({Object}, ${parentCallbackID})`);
        GameWrapper.runCallback(parentCallbackID, response[0]["sha"]);
        return 0;
    }
    static getLatestLauncherCommitFailed(e) {
        return 0;
    }
    static getGitApiJSON(path = "", callbackSuccess = null, callbackFail = null, parentCallbackID = "") {
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
    static downloadGameCommit(sha = "", callbackID) {
        sha = String(sha);
        let fileName = sha.concat(".zip");
        let fileUrl = String(`https://github.com/${GameWrapper.sGitOwner}/${GameWrapper.sGitGameRepo}/archive/${sha}.zip`);
        GameWrapper.downloadFile(fileUrl, fileName, callbackID);
        return 0;
    }
    static downloadLauncherCommit(sha = "", callbackID) {
        sha = String(sha);
        let fileName = sha.concat(".zip");
        let fileUrl = String(`https://github.com/${GameWrapper.sGitOwner}/${GameWrapper.sGitLauncherRepo}/archive/${sha}.zip`);
        GameWrapper.downloadFile(fileUrl, fileName, callbackID);
        return 0;
    }
    static downloadFile(url, fileName, callbackID) {
        console.log(`Running GameWrapper.downloadFile(${url}, ${fileName})`);
        let filePath = path.resolve(GameWrapper.downloadPath, fileName);
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
    static extractZip(file, dest = __RES__, parentCallbackID) {
        try {
            extract(path.resolve(GameWrapper.downloadPath, file), { "dir": dest }, (e) => {
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
    // Game Update
    static applyGameCommit(sha, parentCallbackID = "") {
        console.log(`Running GameWrapper.applyGameCommit(${sha}, ${parentCallbackID})`);
        if (!GameWrapper.testDownloadDirectory()) {
            GameWrapper.createDownloadDirectory();
        }
        GameWrapper.applyGameCommitPhaseTwo(sha, parentCallbackID);
        return 0;
    }
    /**
     * Creates download and game directories, downloads commit, and extracts commit
     * @param {string} sha 
     * @param {(string|null)} parentCallbackID 
     */
    static applyGameCommitPhaseTwo(sha, parentCallbackID = "") {
        console.log(`Running GameWrapper.applyGameCommitPhaseTwo(${sha}, ${parentCallbackID})`);
        sha = Tools.filterID(sha);
        parentCallbackID = Tools.filterID(parentCallbackID);
        let callbackID = Tools.genUUIDv4();
        GameWrapper.createCallback(callbackID, parentCallbackID, [sha], GameWrapper.applyGameCommitPhaseThree);
        GameWrapper.downloadGameCommit(sha, callbackID);
        return 0;
    }
    static applyGameCommitPhaseThree(sha, response, parentCallbackID) {
        console.log(`Running GameWrapper.applyGameCommitPhaseThree(${sha}, ${response}, ${parentCallbackID})`);
        if (GameWrapper.testGameDirectory()) {
            GameWrapper.removeGameDirectory();
        }
        GameWrapper.applyGameCommitPhaseFour(sha, response, parentCallbackID);
        return 0;
    }
    /**
     * 
     * @param {string} sha 
     * @param {string} response Destination, hopefully.
     * @param {(string|null)} parentCallbackID 
     */
    static applyGameCommitPhaseFour(sha, response, parentCallbackID) {
        console.log(`Running GameWrapper.applyGameCommitPhaseFour(${sha}, ${response}, ${parentCallbackID})`);
        sha = Tools.filterID(sha);
        parentCallbackID = Tools.filterID(parentCallbackID);
        let callbackID = Tools.genUUIDv4();
        GameWrapper.createCallback(callbackID, parentCallbackID, [sha, response], GameWrapper.applyGameCommitPhaseFive);
        GameWrapper.extractZip(response, __RES__, callbackID);
        return 0;
    }
    /**
     * 
     * @param {string} sha 
     * @param {string} dest 
     * @param {boolean} response 
     * @param {string} parentCallbackID 
     */
    static applyGameCommitPhaseFive(sha, dest, response, parentCallbackID) {
        console.log(`Running GameWrapper.applyGameCommitPhaseFive()`);
        let sFrom = path.resolve(__RES__, GameWrapper.sGitGameRepo.concat("-").concat(sha));
        fse.moveSync(sFrom, GameWrapper.gamePath);
        GameWrapper.hasGameFiles = GameWrapper.testGameDirectory();
        return 0;
    }
    static applyLatestGameCommit() {
        let callbackID = Tools.genUUIDv4();
        GameWrapper.createCallback(callbackID, null, null, GameWrapper.applyGameCommit);
        GameWrapper.getLatestGameCommit(callbackID);
        return 0;
    }
    // Launcher Update
    static applyLauncherCommit(sha, parentCallbackID = "") {
        console.log(`Running GameWrapper.applyLauncherCommit(${sha}, ${parentCallbackID})`);
        if (!GameWrapper.testDownloadDirectory()) {
            GameWrapper.createDownloadDirectory();
        }
        GameWrapper.applyLauncherCommitPhaseTwo(sha, parentCallbackID);
        return 0;
    }
    /**
     * Creates download and game directories, downloads commit, and extracts commit
     * @param {string} sha 
     * @param {(string|null)} parentCallbackID 
     */
    static applyLauncherCommitPhaseTwo(sha, parentCallbackID = "") {
        console.log(`Running GameWrapper.applyLauncherCommitPhaseTwo(${sha}, ${parentCallbackID})`);
        sha = Tools.filterID(sha);
        parentCallbackID = Tools.filterID(parentCallbackID);
        let callbackID = Tools.genUUIDv4();
        GameWrapper.createCallback(callbackID, parentCallbackID, [sha], GameWrapper.applyLauncherCommitPhaseThree);
        GameWrapper.downloadLauncherCommit(sha, callbackID);
        return 0;
    }
    static applyLauncherCommitPhaseThree(sha, response, parentCallbackID) {
        console.log(`Running GameWrapper.applyLauncherCommitPhaseThree(${sha}, ${response}, ${parentCallbackID})`);
        if (GameWrapper.testGameDirectory()) {
            GameWrapper.removeGameDirectory();
        }
        GameWrapper.applyLauncherCommitPhaseFour(sha, response, parentCallbackID);
        return 0;
    }
    /**
     * 
     * @param {string} sha 
     * @param {string} response Destination, hopefully.
     * @param {(string|null)} parentCallbackID 
     */
    static applyLauncherCommitPhaseFour(sha, response, parentCallbackID) {
        console.log(`Running GameWrapper.applyLauncherCommitPhaseFour(${sha}, ${response}, ${parentCallbackID})`);
        sha = Tools.filterID(sha);
        parentCallbackID = Tools.filterID(parentCallbackID);
        let callbackID = Tools.genUUIDv4();
        GameWrapper.createCallback(callbackID, parentCallbackID, [sha, response], GameWrapper.applyLauncherCommitPhaseFive);
        GameWrapper.extractZip(response, __RES__, callbackID);
        return 0;
    }
    /**
     * Move files where they need to go
     * @param {string} sha 
     * @param {string} dest 
     * @param {boolean} response 
     * @param {string} parentCallbackID 
     */
    static applyLauncherCommitPhaseFive(sha, dest, response, parentCallbackID) {
        console.log(`Running GameWrapper.applyLauncherCommitPhaseFive()`);
        let sFrom = path.resolve(__RES__, GameWrapper.sGitGameRepo.concat("-").concat(sha));
        // move index file 'cause that's all i think i'll ever be using :D - 2021-03-12 02:08
        fse.moveSync(path.resolve(sFrom, "index.js"), path.resolve(__APP__, "index.js"));
        return 0;
    }
    static applyLatestLauncherCommit() {
        let callbackID = Tools.genUUIDv4();
        GameWrapper.createCallback(callbackID, null, null, GameWrapper.applyLauncherCommit);
        GameWrapper.getLatestLauncherCommit(callbackID);
        return 0;
    }
}
GameWrapper.initialize();