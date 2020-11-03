angular.module('appControllers').controller('MapCtrl', MapCtrl);           // get the main module contollers set
MapCtrl.$inject = ['$rootScope', '$scope', '$state', '$http', '$interval'];  // Inject my dependencies


function MapCtrl($rootScope, $scope, $state, $http, $interval) {
	let TRAFFIC_MAX_AGE_SECONDS = 15;


	$scope.$parent.helppage = 'plates/radar-help.html';

	$scope.aircraftSymbols = new ol.source.Vector();
	$scope.aircraftTrails = new ol.source.Vector();

	let offlineMap = new ol.layer.Image({
		title: '[offline] OSM LowRes',
		visible: false,
		type: 'base',
		source: new ol.source.ImageStatic({
			url: 'img/world_large.png',
			imageExtent: [-20037508.342789244,-20037508.342789244,20037508.342789244,20037508.342789244],
			projection: 'EPSG:3857',
			imageSize: [8192, 8192]
		})
	});

	let osm = new ol.layer.Tile({
		title: '[online] OSM',
		type: 'base',
		source: new ol.source.OSM()
	});

	let openaip = new ol.layer.Tile({
		title: '[online] OpenAIP',
		type: 'overlay',
		visible: false,
		source: new ol.source.XYZ({
			url: 'http://{1-2}.tile.maps.openaip.net/geowebcache/service/tms/1.0.0/openaip_basemap@EPSG%3A900913@png/{z}/{x}/{-y}.png'
		})
	});

	let aircraftSymbolsLayer = new ol.layer.Vector({
		title: 'Aircraft symbols',
		source: $scope.aircraftSymbols
	});
	let aircraftTrailsLayer = new ol.layer.Vector({
		title: 'Aircraft trails 5NM',
		source: $scope.aircraftTrails
	});

	$scope.map = new ol.Map({
		target: 'map_display',
		layers: [
			offlineMap,
			osm,
			openaip,
			aircraftSymbolsLayer,
			aircraftTrailsLayer
		],
		view: new ol.View({
			center: ol.proj.fromLonLat([10.0, 52.0]),
			zoom: 4,
			enableRotation: false
		})
	});
	$scope.map.addControl(new ol.control.LayerSwitcher());
	
	$scope.aircraft = [];

	function connect($scope) {
		if (($scope === undefined) || ($scope === null))
			return;  // we are getting called once after clicking away from the status page

		if (($scope.socket === undefined) || ($scope.socket === null)) {
			socket = new WebSocket(URL_TRAFFIC_WS);
			$scope.socket = socket;                  // store socket in scope for enter/exit usage
		}
		
		$scope.ConnectState = 'Disconnected';

		socket.onopen = function(msg) {
			$scope.ConnectState = 'Connected';
			$scope.$apply();
		};

		socket.onclose = function(msg) {
			$scope.ConnectState = 'Disconnected';
			$scope.$apply();
			if ($scope.socket !== null ) {
				setTimeout(connect, 1000);   // do not set timeout after exit
			}
		};

		socket.onerror = function(msg) {
			// $scope.ConnectStyle = "label-danger";
			$scope.ConnectState = 'Problem';
			$scope.$apply();
		};

		socket.onmessage = function(msg) {
			loadSituation(msg.data);
			$scope.onMessage(msg);
		};
	}
	
	function loadSituation(data) { // mySituation
        situation = angular.fromJson(data);
        // consider using angular.extend()
        $scope.raw_data = angular.toJson(data, true); // makes it pretty


        $scope.gps_alt = situation.GPSAltitudeMSL.toFixed(1);
        $scope.gps_height_above_ellipsoid = situation.GPSHeightAboveEllipsoid.toFixed(1);
		$scope.press_alt = Math.round(situation.BaroPressureAltitude.toFixed(0));
		
		var GPSAlt = Math.round(situation.GPSAltitudeMSL);
      var baroAlt = Math.round(situation.BaroPressureAltitude);
      $scope.qfe = Number(1013) - baroAlt / 27;
      $scope.qnh = qfe + GPSAlt / 27;
	  
		
        if ($scope.gps_lat == 0 && $scope.gps_lon == 0) {
            $scope.gps_lat = "--";
            $scope.gps_lon = "--";
            $scope.gps_alt = "--";
            $scope.gps_height_above_ellipsoid = "--";
            $scope.gps_track = "--";
            $scope.gps_speed = "--";
            $scope.gps_vert_speed = "--";
        }

    }
	

	let colorCache = {};
	function getColorForAircraft(aircraft) {
		let key = 'traffic-style' + aircraft.Last_source + aircraft.TargetType;
		if (colorCache[key])
			return colorCache[key];

		let dummyElem = document.createElement('div');
		dummyElem.classList.add(key);
		document.body.appendChild(dummyElem);
		let style = window.getComputedStyle(dummyElem);
		let color = style.getPropertyValue('background-color');
		document.body.removeChild(dummyElem);
		colorCache[key] = color;
		return color;
	}

	function createPlaneSvg(aircraft) {
		let color = getColorForAircraft(aircraft);

		
		let html = `
			<svg height="30" width="30" viewBox="0 0 250 250" version="1.1" xmlns="http://www.w3.org/2000/svg" >
				<path fill="${color}" stroke="white" stroke-width="5" d="M 247.51404,152.40266 139.05781,71.800946 c 0.80268,-12.451845 1.32473,-40.256266 0.85468,-45.417599 -3.94034,-43.266462 -31.23018,-24.6301193 -31.48335,-5.320367 -0.0693,5.281361 -1.01502,32.598388 -1.10471,50.836622 L 0.2842717,154.37562 0,180.19575 l 110.50058,-50.48239 3.99332,80.29163 -32.042567,22.93816 -0.203845,16.89693 42.271772,-11.59566 0.008,0.1395 42.71311,10.91879 -0.50929,-16.88213 -32.45374,-22.39903 2.61132,-80.35205 111.35995,48.50611 -0.73494,-25.77295 z" fill-rule="evenodd"/>
			</svg>
			`;

		return html;

	}

	// Converts from degrees to radians.
	function toRadians(degrees) {
		return degrees * Math.PI / 180;
	};
	
	// Converts from radians to degrees.
	function toDegrees(radians) {
		return radians * 180 / Math.PI;
	}

	function bearing(startLng, startLat, destLng, destLat) {
		startLat = toRadians(startLat);
		startLng = toRadians(startLng);
		destLat = toRadians(destLat);
		destLng = toRadians(destLng);

		y = Math.sin(destLng - startLng) * Math.cos(destLat);
		x = Math.cos(startLat) * Math.sin(destLat) - Math.sin(startLat) * Math.cos(destLat) * Math.cos(destLng - startLng);
		brng = Math.atan2(y, x);
		brng = toDegrees(brng);
		return (brng + 360) % 360;
	}

	function distance(lon1, lat1, lon2, lat2) {
		var R = 6371; // Radius of the earth in km
		var dLat = toRadians(lat2-lat1);  // deg2rad below
		var dLon = toRadians(lon2-lon1); 
		var a = 
			Math.sin(dLat/2) * Math.sin(dLat/2) +
			Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * 
			Math.sin(dLon/2) * Math.sin(dLon/2)
			; 
		var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
		var d = R * c; // Distance in km
		return d;
	}

	function computeTrackFromPositions(aircraft) {
		let dist = 0;
		let prev = [aircraft.Lng, aircraft.Lat]

		// Scan backwards until we have at least 500m of position data
		for (var i = aircraft.posHistory.length - 1; i >= 0; i--) {
			dist += distance(prev[0], prev[1], aircraft.posHistory[i][0], aircraft.posHistory[i][1]);
			prev = aircraft.posHistory[i];
			if (dist >= 0.5)
				break;
			
		}
		if (dist != 0 && i >= 0) {
			return bearing(aircraft.posHistory[i][0], aircraft.posHistory[i][1], aircraft.Lng, aircraft.Lat);
		}
		return 0;
	}

	function clipPosHistory(aircraft, maxLenKm) {
		let dist = 0;
		for (var i = aircraft.posHistory.length - 2; i >= 0; i--) {
			let prev = aircraft.posHistory[i+1];
			let curr = aircraft.posHistory[i];
			dist += distance(prev[0], prev[1], curr[0], curr[1]);
			if (dist > maxLenKm)
				break;
		}
		if (i > 0)
			aircraft.posHistory = aircraft.posHistory.slice(i);
	}

	function updateOpacity(aircraft) {
		let opacity = 1.0 - (aircraft.Age / 15.0);
		if (aircraft.Age <= 0)
			opacity = 1;
		if (aircraft.Age >= 15)
			opacity = 0;
		
		return aircraft.marker.getStyle().getImage().setOpacity(opacity);
	}

	function updateAircraftText(aircraft) {
		let text = '';
		if (aircraft.Tail.length > 0)
			text += aircraft.Tail + '\n';
		text += aircraft.Alt + 'ft';
		if (aircraft.Speed_valid)
			text += '\n' + aircraft.Speed + 'kt'
		aircraft.marker.getStyle().getText().setText(text);
	}

	function updateAircraftTrail(aircraft) {
		if (!aircraft.posHistory || aircraft.posHistory.length < 2)
			return;

		let coords = [];
		for (let c of aircraft.posHistory)
			coords.push(ol.proj.fromLonLat(c));
		coords.push(ol.proj.fromLonLat([aircraft.Lng, aircraft.Lat]));

		let trailFeature = aircraft.trail;
		if (!aircraft.trail) {
			trailFeature = new ol.Feature({
				geometry: new ol.geom.LineString(coords)
			});
			aircraft.trail = trailFeature;
			$scope.aircraftTrails.addFeature(trailFeature);
		} else {
			trailFeature.getGeometry().setCoordinates(coords);
		}
	}

	$scope.onMessage = function(msg) {
		let aircraft = JSON.parse(msg.data);
		if (!aircraft.Position_valid || aircraft.Age > TRAFFIC_MAX_AGE_SECONDS)
			return;

		aircraft.receivedTs = Date.now();
		let prevColor = undefined;

		// It is only a 'real' update, if the traffic's Age actually changes.
		// If it doesn't, don't restart animation (only interpolated position).
		let isActualUpdate = true;
		let updateIndex = -1;
		for (let i in $scope.aircraft) {
			if ($scope.aircraft[i].Icao_addr == aircraft.Icao_addr) {
				let oldAircraft = $scope.aircraft[i];
				prevColor = getColorForAircraft(oldAircraft);
				aircraft.marker = oldAircraft.marker;
				aircraft.trail = oldAircraft.trail;
				aircraft.posHistory = oldAircraft.posHistory;

				let prevRecordedPos = aircraft.posHistory[aircraft.posHistory.length - 1];
				 // remember one coord each 100m
				if (distance(prevRecordedPos[0], prevRecordedPos[1], aircraft.Lng, aircraft.Lat) > 0.1) {
					aircraft.posHistory.push([aircraft.Lng, aircraft.Lat]);
				}
				
				// At most 10 positions per aircraft
				aircraft.posHistroy = clipPosHistory(aircraft, 9.25);

				if (!aircraft.Speed_valid) {
					// Compute fake track from last to current position
					aircraft.Track = computeTrackFromPositions(aircraft);
				}
				isActualUpdate = (aircraft.Age < oldAircraft.Age);

				$scope.aircraft[i] = aircraft;
				updateIndex = i;
			}
		}
		if (updateIndex < 0) {
			$scope.aircraft.push(aircraft);
			aircraft.posHistory = [[aircraft.Lng, aircraft.Lat]];
		}

		let acPosition = [aircraft.Lng, aircraft.Lat];

		if (!aircraft.marker) {
			let planeStyle = new ol.style.Style({
				text: new ol.style.Text({
					text: '',
					offsetY: 40,
					font: 'bold 1em sans-serif',
					stroke: new ol.style.Stroke({color: 'white', width: 2}),
				})
			});
			let planeFeature = new ol.Feature({
				geometry: new ol.geom.Point(ol.proj.fromLonLat(acPosition))
			});
			planeFeature.setStyle(planeStyle);

			aircraft.marker = planeFeature;
			$scope.aircraftSymbols.addFeature(planeFeature);
		} else {
			aircraft.marker.getGeometry().setCoordinates(ol.proj.fromLonLat(acPosition));
			updateAircraftTrail(aircraft);
		}

		updateAircraftText(aircraft);
		if (!prevColor || prevColor != getColorForAircraft(aircraft)) {
			let imageStyle = new ol.style.Icon({
				opacity: 1.0,
				src: 'data:image/svg+xml;utf8,' + createPlaneSvg(aircraft),
				rotation: aircraft.Track,
				anchor: [0.5, 0.5],
				anchorXUnits: 'fraction',
				anchorYUnits: 'fraction'
			});
			aircraft.marker.getStyle().setImage(imageStyle); // to update the color if latest source changed
		}
		updateOpacity(aircraft);
		aircraft.marker.getStyle().getImage().setRotation(toRadians(aircraft.Track));
	}

	$scope.updateAges = function() {
		let now = Date.now();
		for (let ac of $scope.aircraft) {
			// Remember the "Age" value when we received the traffic
			if (!ac.ageReceived)
				ac.ageReceived = ac.Age;
			ac.Age = ac.ageReceived + (now - ac.receivedTs) / 1000.0;
			updateOpacity(ac);
		}
	}

	$scope.removeStaleTraffic = function() {
		let now = Date.now();
		for (let i = 0; i < $scope.aircraft.length; i++) {
			let aircraft = $scope.aircraft[i];
			if (aircraft.Age > TRAFFIC_MAX_AGE_SECONDS) {
				if (aircraft.marker)
					$scope.aircraftSymbols.removeFeature(aircraft.marker);
				if (aircraft.trail)
					$scope.aircraftTrails.removeFeature(aircraft.trail);
				$scope.aircraft.splice(i, 1);
				i--;
			}
		}
	}

	$scope.update = function() {
		$scope.updateAges();
		$scope.removeStaleTraffic();
	}


	function getLocationForInitialPosition() {
		$http.get(URL_GET_SITUATION).then(function(response) {
			situation = angular.fromJson(response.data);
			if (situation.GPSFixQuality > 0) {
				pos = ol.proj.fromLonLat([situation.GPSLongitude, situation.GPSLatitude])
				$scope.map.setView(new ol.View({
					center: pos,
					zoom: 10,
					enableRotation: false
				}));


				let gpsLayer = new ol.layer.Vector({
					source: new ol.source.Vector({
						features: [
							new ol.Feature({
								geometry: new ol.geom.Point(pos),
								name: 'Your GPS position'
							})
						]
					}),
					style: new ol.style.Style({
						text: new ol.style.Text({
							text: '\uf041',
							font: 'normal 35px FontAwesome',
							textBaseline: 'bottom'
						})
					})
				});
				$scope.map.addLayer(gpsLayer);
			}
		});
	};

	$state.get('map').onExit = function () {
		// disconnect from the socket
		if (($scope.socket !== undefined) && ($scope.socket !== null)) {
			$scope.socket.close();
			$scope.socket = null;
		}
		// stop stale traffic cleanup
		$interval.cancel($scope.update);
	}


	connect($scope);
	getLocationForInitialPosition();

	$interval($scope.update, 1000);

}
