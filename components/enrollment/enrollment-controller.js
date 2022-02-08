/* global trackerCapture, angular */

var trackerCapture = angular.module('trackerCapture');
trackerCapture.controller('EnrollmentController',
        function($rootScope,
                $scope,  
                $route,
                $location,
                $timeout,
                $translate,
                $parse,
                DateUtils,
                SessionStorageService,
                CurrentSelection,
                EnrollmentService,
                ModalService,
                OrgUnitFactory,
                NotificationService,
                AuthorityService) {
    
        var selections;
        $scope.userAuthority = AuthorityService.getUserAuthorities(SessionStorageService.get('USER_PROFILE'));
        var currentReportDate;
        var inputNotificationClasses = { pending: 'input-pending', saved:'input-success', error: 'input-error', none: ''};
        var getDefaultReportDateState = function(){
            return {
                date: "",
                editable: false,
                minDate: "",
                maxDate: "0"
            };
        }

        $scope.getReportDateNotificationClass = function(reportDateType){
            var notificationClass = "form-control";
            if(currentReportDate && currentReportDate.type === reportDateType){
                notificationClass+= (" "+inputNotificationClasses[currentReportDate.status]);
            }
            return notificationClass;
        };

        var setEnrollmentState = function(){
            if($scope.selectedProgram){
                $scope.enrollmentDateState.editable = true;
                $scope.enrollmentDateState.warnIfEdit = false;
                $scope.enrollmentDateState.maxDate = $scope.selectedProgram.selectEnrollmentDatesInFuture ? '' : "0";
                if($scope.selectedOrgUnit.reportDateRange){
                    $scope.enrollmentDateState.minDate = DateUtils.formatFromApiToUserCalendar($scope.selectedOrgUnit.reportDateRange.minDate);
                    $scope.enrollmentDateState.minDate = DateUtils.formatFromApiToUser($scope.enrollmentDateState.minDate);
                }
                if ($scope.selectedOrgUnit.reportDateRange.maxDate) {
                    $scope.enrollmentDateState.maxDate = $scope.selectedOrgUnit.reportDateRange.maxDate;
                }
                
                $scope.incidentDateState.editable = true;
                $scope.incidentDateState.warnIfEdit = false;
                $scope.enrollmentGeometryState.editable = true;
                $scope.incidentDateState.maxDate =  $scope.selectedProgram.selectIncidentDatesInFuture ? '' : "0";
                //Check if enrollmentDate and incidentDate is editable
                var autoGeneratedStages = $scope.selectedProgram.allProgramStagesMetadataRead.filter(function(ps) { return ps.autoGenerateEvent });
                autoGeneratedStages.forEach(function(ps) {
                    var reportDateToUseLC = ps.reportDateToUse && ps.reportDateToUse.toLowerCase();
                    if(reportDateToUseLC === 'incidentdate' || (!reportDateToUseLC && !ps.generatedByEnrollmentDate)){
                        $scope.incidentDateState.warnIfEdit = true;
                    }else if(reportDateToUseLC ==='enrollmentdate' || (!reportDateToUseLC && ps.generatedByEnrollmentDate)){
                        $scope.enrollmentDateState.warnIfEdit = true;
                    }
                });
            }
            if($scope.selectedEnrollment && $scope.selectedTei && $scope.selectedProgram){
                if($scope.selectedTei.programOwnersById && $scope.selectedTei.programOwnersById[$scope.selectedProgram.id] != $scope.selectedOrgUnit.id){
                    $scope.incidentDateState.editable = $scope.enrollmentDateState.editable = false;
                    $scope.enrollmentGeometryState.editable = false;
                }
                $scope.incidentDateState.date = $scope.selectedEnrollment.incidentDate;
                $scope.enrollmentDateState.date = $scope.selectedEnrollment.enrollmentDate;
                $scope.enrollmentGeometryState.geometry = $scope.selectedEnrollment.geometry;
            }
        }

        var setOwnerOrgUnit = function() {
            var owningOrgUnitId = CurrentSelection.currentSelection.tei.programOwnersById[$scope.selectedProgram.id];
            if (owningOrgUnitId) {
                OrgUnitFactory.getFromStoreOrServer(owningOrgUnitId).then(function(orgUnit){
                    $scope.owningOrgUnitName = orgUnit.displayName;
                });
            } else {
                $scope.owningOrgUnitName = CurrentSelection.get().orgUnit.displayName;
            }
        }

        $scope.$on('ownerUpdated', function(event, args){
            setOwnerOrgUnit();
        });

        //listen for the selected items
        $scope.$on('selectedItems', function (event, args) {
            currentReportDate = null;
            selections = CurrentSelection.get();
            $scope.today = DateUtils.getToday();
            $scope.selectedOrgUnit = selections.orgUnit;
            $scope.attributes = [];
            $scope.historicalEnrollments = [];
            $scope.showEnrollmentDiv = false;
            $scope.showEnrollmentHistoryDiv = false;
            $scope.hasEnrollmentHistory = false;
            $scope.selectedEnrollment = null;
            $scope.currentEnrollment = null;
            $scope.newEnrollment = {};
            $scope.allEventsSorted = [];

            processSelectedTei();

            $scope.selectedEntity = selections.te;
            $scope.selectedProgram = selections.pr;
            $scope.optionSets = selections.optionSets;
            $scope.programs = selections.prs;
            $scope.hasOtherPrograms = $scope.programs.length > 1 ? true : false;
            var selectedEnrollment = selections.selectedEnrollment;
            $scope.enrollments = selections.enrollments;
            $scope.programExists = args.programExists;
            $scope.programNames = selections.prNames;

            $scope.programStageNames = selections.prStNames;
            $scope.attributesById = CurrentSelection.getAttributesById();
            $scope.activeEnrollments = [];

            $scope.enrollmentDateState= getDefaultReportDateState();
            $scope.incidentDateState = getDefaultReportDateState();
            $scope.enrollmentGeometryState = { editable: false, geometry: null };
            angular.forEach(selections.enrollments, function (en) {
                if (en.status === "ACTIVE" && $scope.selectedProgram && $scope.selectedProgram.id !== en.program) {
                    $scope.activeEnrollments.push(en);
                }
            });
            if ($scope.selectedProgram) {
                $scope.stagesById = [];
                angular.forEach($scope.selectedProgram.programStages, function (stage) {
                    $scope.stagesById[stage.id] = stage;
                });

                setOwnerOrgUnit();

                angular.forEach($scope.enrollments, function (enrollment) {
                    if (enrollment.program === $scope.selectedProgram.id) {
                        if (enrollment.status === 'ACTIVE') {
                            selectedEnrollment = enrollment;
                            $scope.currentEnrollment = enrollment;
                        }
                        if (enrollment.status === 'CANCELLED' || enrollment.status === 'COMPLETED') {
                            $scope.historicalEnrollments.push(enrollment);
                            $scope.hasEnrollmentHistory = true;
                        }
                    }
                });
                if (selectedEnrollment && selectedEnrollment.status === 'ACTIVE') {
                    $scope.selectedEnrollment = selectedEnrollment;
                    $scope.loadEnrollmentDetails(selectedEnrollment);
                }
                else {
                    $scope.selectedEnrollment = null;
                    $scope.showEnrollmentHistoryDiv = true;
                    $scope.broadCastSelections('dashboardWidgets');
                }
            }
            else {
                $scope.broadCastSelections('dashboardWidgets');
            }
            setEnrollmentState();
        });

        $scope.$on('dataEntryControllerData',function(event, args){
            $scope.allEventsSorted = args.allEventsSorted;
        });
        $scope.$on('teienrolled', function (event, args) {
            $route.updateParams({program: event.currentScope.selectedProgram.id});
            $route.reload();

        });
        $scope.verifyExpiryDate = function(eventDateStr) {
            if($scope.userAuthority.canEditExpiredStuff) return true;
            var dateGetter = $parse(eventDateStr);
            var dateSetter = dateGetter.assign;
            var date = dateGetter($scope);
            if(!date) {
                return;
            }

            if (!DateUtils.verifyExpiryDate(date, $scope.selectedProgram.expiryPeriodType, $scope.selectedProgram.expiryDays)) {
                NotificationService.showNotifcationDialog($translate.instant("error"), $translate.instant("event_date_out_of_range"));
                dateSetter($scope, null);
                
            }
        };
        $scope.loadEnrollmentDetails = function (enrollment) {
            $scope.showEnrollmentHistoryDiv = false;
            $scope.selectedEnrollment = enrollment;
            $scope.enrollmentDateState.date = enrollment.enrollmentDate;
            $scope.incidentDateState.date = enrollment.incidentDate;
            $scope.enrollmentGeometryState.geometry = $scope.selectedEnrollment.geometry;

            if ($scope.selectedEnrollment.enrollment && $scope.selectedEnrollment.orgUnit) {
                $scope.broadCastSelections('dashboardWidgets');
            }
        };

        $scope.showNewEnrollment = function () {
            if($scope.selectedProgram.onlyEnrollOnce && $scope.hasEnrollmentHistory) {
                var modalOptions = {
                    headerText: 'warning',
                    bodyText: 'can_not_add_new_enrollment'
                };
    
                ModalService.showModal({}, modalOptions);

                return;
            }
            
            $scope.showEnrollmentDiv = !$scope.showEnrollmentDiv;

            if(!$scope.showEnrollmentDiv) {
                return;
            }

            if ($scope.showEnrollmentDiv) {

                $scope.showEnrollmentHistoryDiv = false;

                //load new enrollment details
                $scope.selectedEnrollment = {orgUnitName: $scope.selectedOrgUnit.displayName};
                
                if( $scope.selectedProgram && $scope.selectedProgram.captureCoordinates ){
                    $scope.selectedEnrollment.coordinate = {};
                }

                $scope.loadEnrollmentDetails($scope.selectedEnrollment);
                
                $timeout(function () {
                    $rootScope.$broadcast('registrationWidget', {
                        registrationMode: 'ENROLLMENT',
                        selectedTei: $scope.selectedTei
                    });
                }, 200);
            }
            else {
                hideEnrollmentDiv();
            }
        };

        $scope.showEnrollmentHistory = function () {

            $scope.showEnrollmentHistoryDiv = !$scope.showEnrollmentHistoryDiv;

            if ($scope.showEnrollmentHistoryDiv) {
                $scope.selectedEnrollment = null;
                $scope.showEnrollmentDiv = false;

                $scope.broadCastSelections('dashboardWidgets');
            }
        };

        $scope.broadCastSelections = function (listeners) {
            var tei = selections.tei;
            CurrentSelection.set({
                tei: tei,
                te: $scope.selectedEntity,
                prs: $scope.programs,
                pr: $scope.selectedProgram,
                prNames: $scope.programNames,
                prStNames: $scope.programStageNames,
                enrollments: $scope.enrollments,
                selectedEnrollment: $scope.selectedEnrollment,
                optionSets: $scope.optionSets,
                orgUnit: selections.orgUnit
            });
            $timeout(function () {
                $rootScope.$broadcast(listeners, {});
            }, 200);
        };

        var processSelectedTei = function () {
            $scope.selectedTei = angular.copy(selections.tei);
            angular.forEach($scope.selectedTei.attributes, function (att) {
                $scope.selectedTei[att.attribute] = att.value;
            });
        };

        var hideEnrollmentDiv = function () {

            /*currently the only way to cancel enrollment window is by going through
             * the main dashboard controller. Here I am mixing program and programId,
             * as I didn't want to refetch program from server, the main dashboard
             * has already fetched the programs. With the ID passed to it, it will
             * pass back the actual program than ID.
             */
            processSelectedTei();
            $scope.selectedProgram = ($location.search()).program;
            $scope.broadCastSelections('mainDashboard');
        };

        $scope.activateDeactivateEnrollment = function () {
            
            if($scope.enrollmentForm && $scope.enrollmentForm.$invalid){
                NotificationService.showNotifcationDialog($translate.instant("error"), $translate.instant("form_invalid"));
                return;
            }
            
            var modalOptions = {
                closeButtonText: 'no',
                actionButtonText: 'yes',
                headerText: $scope.selectedEnrollment.status === 'CANCELLED' ? 'activate_enrollment' : 'deactivate_enrollment',
                bodyText: $scope.selectedEnrollment.status === 'CANCELLED' ? 'are_you_sure_to_activate_enrollment' : 'are_you_sure_to_deactivate_enrollment'
            };


            ModalService.showModal({}, modalOptions).then(function (result) {
                
                var en = angular.copy( $scope.selectedEnrollment );
                en.status = $scope.selectedEnrollment.status === 'CANCELLED' ? 'ACTIVE' : 'CANCELLED';
                EnrollmentService.update( en ).then(function ( data ) {
                    if( data && data.status === 'OK' ){
                        $scope.selectedEnrollment.status = $scope.selectedEnrollment.status === 'CANCELLED' ? 'ACTIVE' : 'CANCELLED';
                        $scope.loadEnrollmentDetails($scope.selectedEnrollment);
                    }                    
                });
            });
        };

        $scope.completeReopenEnrollment = function () {
            
            if($scope.enrollmentForm && $scope.enrollmentForm.$invalid){
                NotificationService.showNotifcationDialog($translate.instant("error"), $translate.instant("form_invalid"));
                return;
            }
            
            var modalOptions = {
                closeButtonText: 'no',
                actionButtonText: 'yes',
                headerText: $scope.selectedEnrollment.status === 'ACTIVE' ? 'complete_enrollment' : 'reopen_enrollment',
                bodyText: $scope.selectedEnrollment.status === 'ACTIVE' ? 'are_you_sure_to_complete_enrollment' : 'are_you_sure_to_reopen_enrollment'
            };


            ModalService.showModal({}, modalOptions).then(function (result) {
                
                var en = angular.copy( $scope.selectedEnrollment );
                en.status = $scope.selectedEnrollment.status === 'ACTIVE' ? 'COMPLETED' : 'ACTIVE';
                EnrollmentService.update( en ).then(function (data) {
                    if( data && data.status === 'OK' ){
                        $scope.selectedEnrollment.status = $scope.selectedEnrollment.status === 'ACTIVE' ? 'COMPLETED' : 'ACTIVE';
                        $scope.loadEnrollmentDetails($scope.selectedEnrollment);
                    }
                });
            });
        };

        var canDeleteEnrollment = function(){
            if($scope.selectedProgram && $scope.selectedProgram.access.data.write){
                if($scope.allEventsSorted && $scope.allEventsSorted.length > 0){
                    if(!$scope.userAuthority.canCascadeDeleteEnrollment) return false;
                }
                return true;
            }
            return false;

        }
        
        $scope.deleteEnrollment = function () {
            if(!canDeleteEnrollment()){
                var bodyText = $translate.instant("cannot_delete_this_enrollment_because_it_already_contains_events");
                var headerText = $translate.instant('delete_failed');
                return NotificationService.showNotifcationDialog(headerText, bodyText);
            }
            var modalOptions = {
                closeButtonText: 'no',
                actionButtonText: 'yes',
                headerText: 'delete_enrollment',
                bodyText: 'are_you_sure_to_delete_enrollment'
            };

            ModalService.showModal({}, modalOptions).then(function (result) {                
                EnrollmentService.delete( $scope.selectedEnrollment ).then(function (data) {
                    if(data.httpStatus === 'OK' || data.httpStatusCode === 200) {
                        angular.forEach($scope.enrollments, function(enrollment, index){
                            if(enrollment.enrollment === $scope.selectedEnrollment.enrollment){
                                $scope.enrollments.splice(index, 1);
                            }
                        });

                        $timeout(function () {
                            $rootScope.$broadcast('ErollmentDeleted', {enrollments: $scope.enrollments});
                        }, 200);

                        $scope.currentEnrollment = null;
                        $scope.selectedEnrollment = null;
                        NotificationService.showNotifcationDialog($translate.instant('success'), $translate.instant('enrollment') + ' ' + $translate.instant('deleted'));
                    }
                });
            });
        };

        $scope.markForFollowup = function () {
            
            if($scope.enrollmentForm && $scope.enrollmentForm.$invalid){
                NotificationService.showNotifcationDialog($translate.instant("error"), $translate.instant("form_invalid"));
                return;
            }
            
            $scope.selectedEnrollment.followup = !$scope.selectedEnrollment.followup;
            EnrollmentService.update($scope.selectedEnrollment);
        };

        $scope.updateEnrollmentDate = function(){
            if($scope.enrollmentForm && $scope.enrollmentForm.enrollmentDateForm && $scope.enrollmentForm.enrollmentDateForm.$invalid){
                $scope.enrollmentDateState.date = $scope.selectedEnrollment.enrollmentDate;
                return NotificationService.showNotifcationDialog($translate.instant('error'), $scope.selectedProgram.enrollmentDateLabel + ' ' + $translate.instant('invalid'));
            }
            else if(!$scope.userAuthority.canEditExpiredStuff && !DateUtils.verifyExpiryDate($scope.enrollmentDateState.date, $scope.selectedProgram.expiryPeriodType, $scope.selectedProgram.expiryDays)){
                $scope.enrollmentDateState.date = $scope.selectedEnrollment.enrollmentDate;
                return NotificationService.showNotifcationDialog($translate.instant('error'), $scope.selectedProgram.enrollmentDateLabel + ' ' + $translate.instant('expired'));
            }
            else if($scope.enrollmentDateState.warnIfEdit ) {
                $scope.askUserToConfirmDateChange($scope.selectedProgram.enrollmentDateLabel).then(function(result){
                    $scope.selectedEnrollment.enrollmentDate = $scope.enrollmentDateState.date;
                    updateReportDate('enrollmentdate');
                }, function(cancelResult){
                    $scope.enrollmentDateState.date = $scope.selectedEnrollment.enrollmentDate;
                });
            } else {
                $scope.selectedEnrollment.enrollmentDate = $scope.enrollmentDateState.date;
                updateReportDate('enrollmentdate');
            }
        }

        $scope.updateIncidentDate = function(){
            if($scope.enrollmentForm && $scope.enrollmentForm.incidentDateForm && $scope.enrollmentForm.incidentDateForm.$invalid){
                $scope.incidentDateState.date = $scope.selectedEnrollment.incidentDate;
                return NotificationService.showNotifcationDialog($translate.instant('error'), $scope.selectedProgram.incidentDateLabel + ' ' + $translate.instant('invalid'));
            }
            else if(!$scope.userAuthority.canEditExpiredStuff && !DateUtils.verifyExpiryDate($scope.incidentDateState.date, $scope.selectedProgram.expiryPeriodType, $scope.selectedProgram.expiryDays)){
                $scope.incidentDateState.date = $scope.selectedEnrollment.incidentDate;
                return NotificationService.showNotifcationDialog($translate.instant('error'), $scope.selectedProgram.incidentDateLabel + ' ' + $translate.instant('expired'));
            }
            else if($scope.incidentDateState.warnIfEdit ) {
                $scope.askUserToConfirmDateChange($scope.selectedProgram.incidentDateLabel).then(function(result){
                    $scope.selectedEnrollment.incidentDate = $scope.incidentDateState.date;
                    updateReportDate('incidentdate');
                }, function(cancelResult){
                    $scope.incidentDateState.date = $scope.selectedEnrollment.incidentDate;
                });
            }
            else {
                $scope.selectedEnrollment.incidentDate = $scope.incidentDateState.date;
                updateReportDate('incidentdate');
            }
        }

        $scope.askUserToConfirmDateChange = function(dateName){
            var modalOptions = {
                closeButtonText: 'cancel',
                headerText: dateName,
                bodyText: 'change_date_with_dependency_information',
                actionButtons: [{ text: 'update', action: {}, class: 'btn btn-primary'}]
            };
        
            return ModalService.showModal({}, modalOptions);
        }

        $scope.updateEnrollmentGeometry = function(){
            if($scope.enrollmentForm && $scope.enrollmentForm.geometryForm && $scope.enrollmentForm.geometryForm.$invalid){
                $scope.enrollmentGeometryState.geometry = $scope.selectedEnrollment.geometry;
                return NotificationService.showNotifcationDialog($translate.instant('error'), $scope.selectedProgram.featureType.toLowerCase() + ' ' + $translate.instant('invalid'));
            }
            $scope.selectedEnrollment.geometry = $scope.enrollmentGeometryState.geometry;
            EnrollmentService.update($scope.selectedEnrollment).then(function(){
                $scope.enrollmentGeometryState.status = 'saved';
            }, function(){
                $scope.enrollmentGeometryState.status = 'error';
            });
        }


        var updateReportDate = function(type){
            currentReportDate = {type: type, status: 'pending'};
            EnrollmentService.update($scope.selectedEnrollment).then(function(){
                currentReportDate.status = 'saved';
            }, function(){
                currentReportDate.status = 'error';
            });   
        }

        $scope.changeProgram = function (program) {
            var pr = $location.search().program;
            if (pr && pr === program) {
                $route.reload();
            }
            else {
                $location.path('/dashboard').search({tei: $scope.selectedTeiId, program: program, ou: $scope.selectedOrgUnit.id});
            }
        };

        $scope.canUseEnrollment = function () {

            if ($scope.selectedTei.inactive) {
                return false;
            }

            if ($scope.currentEnrollment && $scope.selectedEnrollment.enrollment !== $scope.currentEnrollment.enrollment) {
                if ($scope.currentEnrollment.status === 'ACTIVE') {
                    return false;
                }
            }
            if($scope.selectedTei.programOwnersById && $scope.selectedTei.programOwnersById[$scope.selectedProgram.id] !== $scope.selectedOrgUnit.id){
                return false;
            }
            return true;
        };
        
        $scope.saveCoordinate = function(param){            
            var en = angular.copy( $scope.currentEnrollment );            
            $scope.enrollmentLatSaved = false;
            $scope.enrollmentLngSaved = false;            
            EnrollmentService.update( en ).then(function (data) {
                $scope.enrollmentLatSaved = true;
                $scope.enrollmentLngSaved = true;
            });
        };
});
