'use strict';

var fs = require('fs');
var resemble = require('node-resemble-js');
var glob = require("glob");

var config = require('../../visualregressionreport.conf.js').config;
var template = fs.readFileSync('template.html').toString();


resemble.outputSettings({
    transparency: 0.8
});

function VisualTester () {

    var browserConfig = {};

    if (!fs.existsSync(config.screenshotFolder)){
        fs.mkdirSync(config.screenshotFolder);
    }
    if (!fs.existsSync(config.screenshotBaseFolder)){
        fs.mkdirSync(config.screenshotBaseFolder);
    }

    createScreenshotDiffFolder();

    this.generateReport = function () {
        var files = fs.readdirSync(config.screenshotBaseFolder);

        var html = '';

        files.forEach(function (file) {
            var compareHtml = '';
            compareHtml += '<img src="../base' + file + '">';
            compareHtml += '<img src="../base' + file + '">';
            html += compareHtml;
        });

        fs.writeFileSync(config.screenshotDiffFolder + 'diffs.html', html,'utf8' , function() {
            console.log('screenshot diff written ')
        });

    };

    this.compareScreen = function(testDescription, allowedMisMatchPercentage) {

        var flow = protractor.promise.controlFlow();
        flow.execute(function () {
            return doCompareScreen(testDescription, allowedMisMatchPercentage);
        });

        return flow;
    };

    this.removeDiffs = function () {
        glob(config.screenshotDiffFolder + '**.png', function (err, files) {
            if (err) throw err;
            files.forEach(function (file) {
                fs.unlink(file, function (err) {
                    if (err) throw err;
                });
            });
        });
    };

    this.setBrowser = function (browser) {
        browser.getCapabilities().then(function (capabilities) {
            browserConfig = {
                os: capabilities.caps_.platform,
                name: capabilities.caps_.browserName,
                version: capabilities.caps_.version
            };
            config.screenshotDiffFolder += browserConfig.os + ' - ' + browserConfig.name + ' - ' + browserConfig.version + '/';

            createScreenshotDiffFolder();
        });
    };

    function createScreenshotDiffFolder() {
        if (!fs.existsSync(config.screenshotDiffFolder)){
            fs.mkdirSync(config.screenshotDiffFolder);
        }
    }

    function doCompareScreen(testDescription, allowedMisMatchPercentage) {
        var deferred = protractor.promise.defer();

        fs.readFile(config.screenshotBaseFolder + testDescription + '.png', function(error, baseScreenshot) {
            if(error !== null && error.code === 'ENOENT') {
                browser.takeScreenshot().then(function(pngString){
                    saveScreenshot(pngString, testDescription);
                });
                deferred.fulfill(true);
                return;
            }

            browser.takeScreenshot().then(function(pngString) {
                var newScreenshot = new Buffer(pngString, 'base64');
                compareScreenshot(newScreenshot, baseScreenshot, testDescription, allowedMisMatchPercentage, function() {
                    deferred.fulfill(true);
                });
            });
        });

        return deferred.promise;
    }

    function saveScreenshot(pngString, testDescription) {
        var newScreenshot = new Buffer(pngString, 'base64');
        fs.writeFile(config.screenshotBaseFolder + testDescription + '.png', newScreenshot);
    }

    function compareScreenshot(newScreenshot, baseScreenshot, testDescription, allowedMisMatchPercentage, callback) {
        resemble(newScreenshot)
            .compareTo(baseScreenshot)
            .ignoreColors()
            .onComplete(function(data){
                if (Number(data.misMatchPercentage) > allowedMisMatchPercentage) {
                    data.getDiffImage().pack().pipe(
                        fs.createWriteStream(config.screenshotDiffFolder + '/' + testDescription +  ' - differ ' + data.misMatchPercentage + '%.png')
                    );
                    var info = {
                        testDescription: testDescription,
                        misMatchPercentage: data.misMatchPercentage,
                        data: data
                    };

                    writeJSONDiffInfo(info, testDescription);
                }
                callback();
            });
    }

    function writeJSONDiffInfo(info, testDescription) {
        fs.writeFileSync(config.screenshotDiffFolder + '/' + testDescription + '.json', JSON.stringify(info));
    }
}

module.exports = new VisualTester;
