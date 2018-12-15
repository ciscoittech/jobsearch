'use strict';

/**
 * Module dependencies
 */
var path = require('path'),
  mongoose = require('mongoose'),
  Data = mongoose.model('Data'),
  Task = mongoose.model('Task'),
  xray = require('x-ray'),
  Promise = require('bluebird'),
  errorHandler = require(path.resolve('./modules/core/server/controllers/errors.server.controller'));
const Pool = require('threads').Pool;
const pool = new Pool();
pool.on('done', function (job, message) {
  console.log('Job done:', 'job done');
})
  .on('error', function (job, error) {
    console.error(error);
  })
  .on('finished', function () {
    console.log('Everything done');
    // pool.killAll();
  });
/**
 * Start a job
 */
exports.start = function (req, res) {
  if (req.query.role && req.query.site) {
    var url = 'https://' + req.query.site + '/jobs?q=' + req.query.role.replace(' ', '+') + '&l';
    if (req.query.site === 'www.indeed.com') {
      console.log(url);
      Task.findOne({ site: 'www.indeed.com' })
        .then(function (task) {
          if (task) {
            task.status = 'started';
            task.save();
          } else {
            var t = new Task();
            t.site = 'www.indeed.com';
            t.status = 'started';
            t.save();
          }
        });
      indeedCrawlingStart(url, req.query.role); // threads
      return res.status(200).send({
        status: 'started',
        site: req.query.site
      });
    } else if (req.query.site === 'www.dice.com') {
      console.log(url);
      Task.findOne({ site: 'www.dice.com' })
        .then(function (task1) {
          if (task1) {
            task1.status = 'started';
            task1.save();
          } else {
            var t = new Task();
            t.site = 'www.dice.com';
            t.status = 'started';
            t.save();
          }
        });
      diceCrawlingStart(url, req.query.role)
        .then(function (result) {
          console.log(result);
          save(result)
            .then(function () {
              Task.findOne({ site: 'www.dice.com' })
                .then(function (task) {
                  task.status = 'finished';
                  task.save();
                });
            });
        });
      return res.status(200).send({
        status: 'started',
        site: req.query.site
      });
    }
  } else {
    return res.status(200).send({
      status: 'failure',
      message: 'Please input valid params'
    });
  }
};
/**
 * Stop a job
 */
exports.stop = function (req, res) {
  return res.status(200).send({
    status: 'success'
  });

};
function sequentialAsyncMap(array, fn) {
  var p = Promise.resolve();
  array.forEach(function (item, index, collection) {
    p = p.then(function () {
      return fn(item, index, collection);
    });
  });
  return p;
}
function saveData(value) {
  var spData = new Data();
  if (value.title) spData.jobTitle = value.title;
  if (value.description) spData.jobDescription = value.description;
  if (value.company) spData.companyName = value.company;
  if (value.url) spData.site = value.url;
  if (value.role) spData.role = value.role;
  if (value.location) spData.location = value.location;
  if (value.review) spData.review = value.review;

  //  Save Data information.
  return spData.save();
}
function save(spDataObjectArray) {
  if (!spDataObjectArray) {
    return;
  } else {
    return sequentialAsyncMap(spDataObjectArray, saveData);
  }
}
/**
 * Indeed
 */
function indeedCrawlingStart(url, role) {
  var params = {};
  params.url = url;
  params.role = role;
  const crawlingJob = pool.run(function (input, done) {
    // crawling
    var xray = require('x-ray');
    var indeedCrawler = xray({
      filters: {
        trim: function (value) {
          return typeof value === 'string' ? value.trim() : value;
        },
        removeUnStuff: function (value) {
          return typeof value === 'string' ? value.split(',')[1] : value;
        },
        replace: function (value) {
          return typeof value === 'string' ? value.replace('\n', '') : value;
        }
      }
    });
    indeedCrawler(input.url, '.jobsearch-SerpJobCard', [{
      title: '.jobtitle > a@title',
      company: '.jobsearch-SerpJobCard .company > a | replace | trim',
      review: '.slNoUnderline | removeUnStuff',
      location: '.jobsearch-SerpJobCard .location',
      description: '.jobsearch-SerpJobCard .summary | replace | trim',
      url: '.jobsearch-SerpJobCard > h2 .turnstileLink@href'
    }])
      .paginate('.pagination > a:contains(Next)@href')
      .then(function (res) {
        var result = [];
        (res || []).forEach(function (item) {
          item.role = input.role;
          if (!item.title) item.title = 'unknown';
          if (!item.company) item.company = 'unknown';
          if (!item.review) item.review = 'unknown';
          if (!item.location) item.location = 'unknown';
          if (!item.description) item.description = 'unknown';
          if (!item.url) item.url = 'unknown';
          result.push(item);
        });
        done(result);
      });
  },
  {
    xray: 'x-ray',
    mongoose: 'mongoose'
  }).send(params);

  crawlingJob.on('done', function (res) {
    console.log(res);
    return save(res)
      .then(function () {
        return Task.findOne({ site: 'www.indeed.com' })
          .then(function (task) {
            task.status = 'finished';
            return task.save();
          });
      });
  });
}
/**
 * Dice
 */
function diceCrawlingStart(url, role) {
  var input = {};
  input.url = url;
  input.role = role;
  // crawling
  var xray = require('x-ray');
  var diceCrawler = xray({
    filters: {
      trim: function (value) {
        return typeof value === 'string' ? value.trim() : value;
      },
      removeUnStuff: function (value) {
        return typeof value === 'string' ? value.split(',')[1] : value;
      },
      replace: function (value) {
        return typeof value === 'string' ? value.replace('\n', '') : value;
      }
    }
  });
  return diceCrawler(input.url, '.jobs-page-header', [{
    jobCount: '.posiCount'
  }])
    .then(function (res) {
      var str = res[0].jobCount.toString();
      str = str.split('of')[1].split('positions')[0].trim().replace(',', '');
      console.log(str);
      var jobCount = parseInt(str, 10);
      var pageCount = jobCount / 30 + '';
      pageCount = pageCount.split('.')[0];
      var num = parseInt(pageCount, 10);
      console.log(parseInt(pageCount, 10));
      var urls = [];
      var result = [];
      for (var i = 0; i < num; i++) {
        urls[i] = 'https://www.dice.com/jobs/q-' + input.role.split(' ')[0] + '_' + input.role.split(' ')[1] + '-startPage-' + (i + 1) + '-jobs';
      }
      return Promise.map(urls, function (url) {
        var cr = xray();
        return cr(url, '.complete-serp-result-div', [{
          title: '.list-inline h3 > a@title',
          company: '.list-inline .compName',
          location: '.location .jobLoc',
          description: '.shortdesc > span',
          url: 'h3 > a@href'
        }])
          .then(function (items) {
            items.forEach(function (item) {
              item.role = input.role;
              if (!item.title) item.title = 'unknown';
              if (!item.company) item.company = 'unknown';
              if (!item.review) item.review = 'unknown';
              if (!item.location) item.location = 'unknown';
              if (!item.description) item.description = 'unknown';
              if (!item.url) item.url = 'unknown';
              result.push(item);
            });
          });
      }, { concurrency: 4 })
        .then(function () {
          return result;
        });
    });
}
exports.getJobStatus = function (req, res) {
  Task.find()
    .then(function (jobs) {
      return res.status(200).send({
        jobs: jobs,
        message: 'success'
      });
    })
    .catch(function (err) {
      return res.status(200).send({
        message: err
      });
    });
};
