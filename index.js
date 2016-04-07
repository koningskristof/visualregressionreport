'use strict';

var fs = require('fs');
var resemble = require('node-resemble-js');
var glob = require("glob");
var Handlebars = require("handlebars");

var config = require('../../visualregressionreport.conf.js').config;

config.screenshotBaseFolder = config.screenshotFolder + 'base/'
config.screenshotDiffFolder = config.screenshotFolder + 'diff/'


var templateSource = '<html><style>.compare{ width: 100%;} .diffimage, .baseimage, .compareimage { width: 30%; display: inline-block; } img { width: 100%;}</style><body><ul class="imagelist">{{#screenshots}}<li class="compare"><h2>{{testDescription}} ({{misMatchPercentage}} %)</h2></h2><div class="baseimage"><img src="{{base}}"></div><div class="compareimage"><img src="{{compare}}"></div><div class="diffimage"><img src="{{diff}}"></div></li>{{/screenshots}}</ul></body></html>';
var template = Handlebars.compile(templateSource);
var logData = [];


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
        var files = fs.readdirSync(config.screenshotDiffFolder);

        var htmlReport = template({screenshots:logData});

        fs.writeFileSync(config.screenshotDiffFolder + 'diffs.html', htmlReport ,'utf8');

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
                os: capabilities.platform,
                name: capabilities.browserName,
                version: capabilities.version
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
                    saveBaseScreenshot(pngString, testDescription);
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

    function saveBaseScreenshot(pngString, testDescription) {
        var newScreenshot = new Buffer(pngString, 'base64');
        fs.writeFile(config.screenshotBaseFolder + testDescription + '.png', newScreenshot);
    }

    function saveCompareScreenshot(pngString, testDescription, misMatchPercentage) {
        var newScreenshot = new Buffer(pngString, 'base64');
        fs.writeFile(config.screenshotDiffFolder + testDescription + ' - compare ' + misMatchPercentage + '%.png', newScreenshot);
    }

    function compareScreenshot(newScreenshot, baseScreenshot, testDescription, allowedMisMatchPercentage, callback) {
        resemble(newScreenshot)
            .compareTo(baseScreenshot)
            .ignoreColors()
            .onComplete(function(data){
                if (Number(data.misMatchPercentage) > allowedMisMatchPercentage) {
                    saveCompareScreenshot(newScreenshot, testDescription, data.misMatchPercentage);
                    data.getDiffImage().pack().pipe(
                        fs.createWriteStream(config.screenshotDiffFolder + '/' + testDescription +  ' - differ ' + data.misMatchPercentage + '%.png')
                    );
                    var info = {
                        testDescription: testDescription,
                        misMatchPercentage: data.misMatchPercentage,
                        data: data,
                        diff: testDescription +  ' - differ ' + data.misMatchPercentage + '%.png',
                        base: '../../base/' + testDescription + '.png',
                        compare: testDescription + ' - compare ' + data.misMatchPercentage + '%.png'
                    };

                    writeJSONDiffInfo(info, testDescription);
                }
                callback();
            });
    }

    function writeJSONDiffInfo(info, testDescription) {
        logData.push(info);
        //fs.writeFileSync(config.screenshotDiffFolder + '/' + testDescription + '.json', JSON.stringify(info));
    }
}

module.exports = new VisualTester;
