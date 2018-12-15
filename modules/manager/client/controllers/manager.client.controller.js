(function () {
  'use strict';

  angular
    .module('manager')
    .controller('ManagerController', ManagerController);

  ManagerController.$inject = ['$scope', '$filter', 'ManagerService', 'ngDialog', '$interval'];

  function ManagerController($scope, $filter, ManagerService, ngDialog, $interval) {
    var vm = this;
    vm.depth = 0;
    vm.indeedIsFinished = true;
    vm.diceIsFinished = true;
    ManagerService.getJobStatus(function (data) {
      if (data.message === 'success') {
        data.jobs.forEach(function (job) {
          if (job.site === 'www.indeed.com') vm.indeedIsFinished = (job.status === 'finished');
          if (job.site === 'www.dice.com') vm.diceIsFinished = (job.status === 'finished');
        });
      }
    });
    vm.determinateInterval = 0;
    vm.sites = [];
    var site1 = ['www.indeed.com', 'With Indeed, you can search millions of jobs online to find the next step in your career.With tools for job search, resumes, company reviews and more, we are with ...'];
    var site2 = ['www.dice.com', 'Search 70000+ job openings from techs hottest employers. Salary estimations, career path tips and Insights to make your next career move the right one.'];
    vm.sites = [site1, site2];
    vm.stop = function () {
      ManagerService.stop({
        url: vm.url
      }, function (data) {
      });
    };
    vm.role = 'voice engineer';
    $scope.startAlert = function (rel) {
      ngDialog.openConfirm({
        template: 'templateStart',
        className: 'ngdialog-theme-default dialogwidth800',
        scope: $scope
      }).then(
        function (value) {
          console.log('confirm');
          ManagerService.start({
            keyword: vm.role,
            url: rel,
            depth: vm.depth
          }, function (data) {
            toggleBudge(data);
          });
        },
        function (reason) {
          console.log('Modal promise rejected. Reason: ', reason);
        });
    };
    function toggleBudge(data) {
      if (data.site === 'www.indeed.com') {
        if (data.status === 'started') vm.indeedIsFinished = false;
      } else if (data.site === 'www.dice.com') {
        if (data.status === 'started') vm.diceIsFinished = false;
      }
    }
    vm.getStatus = function (site) {
      if (site[0] === 'www.indeed.com')
        return vm.indeedIsFinished;
      else if (site[0] === 'www.dice.com')
        return vm.diceIsFinished;
    };
    $interval(function () {
      vm.determinateInterval += 1;
      if (vm.determinateInterval > 30) {
        ManagerService.getJobStatus(function (data) {
          if (data.message === 'success') {
            data.jobs.forEach(function (job) {
              if (job.site === 'www.indeed.com') vm.indeedIsFinished = (job.status === 'finished');
              if (job.site === 'www.dice.com') vm.diceIsFinished = (job.status === 'finished');
            });
          }
        });
        vm.determinateInterval = 0;
      }
    }, 100);
  }
}());
