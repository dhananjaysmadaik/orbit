// True-colour Sentinel-2 views of four study areas, for the "ground" step of the Orbit site.
// Paste into the Google Earth Engine Code Editor (code.earthengine.google.com) and press Run.
// Each area gets a cloud-masked median composite. Two ways out:
//   1. The Console prints a thumbnail link for each area: open it and save the JPEG directly.
//   2. The Tasks tab lists one Export per area: run them to get full GeoTIFFs in Google Drive.
// Send me the images (or put them in assets/scenes/ as kinnaur-s2.jpg, manchester-s2.jpg,
// valencia-s2.jpg and rome-s2.jpg) and I will wire them into the chapters.
// Credit on the site: "Contains modified Copernicus Sentinel data (2025), processed in Google Earth Engine".

var AREAS = {
  // name: [west, south, east, north] in degrees, plus a date window with little cloud or snow
  kinnaur:    { box: [77.80, 31.40, 78.70, 31.90], start: '2024-10-01', end: '2024-11-30' }, // NH-5, Kafaur to Khab
  himachal:   { box: [75.50, 30.30, 79.10, 33.30], start: '2024-10-01', end: '2024-11-30' },
  rome:       { box: [12.30, 41.82, 12.60, 41.98], start: '2025-06-01', end: '2025-08-31' }, // Vatican City at the centre
  valencia:   { box: [-0.62, 39.20, -0.20, 39.55], start: '2024-11-05', end: '2024-11-30' }, // just after the October 2024 flood
  manchester: { box: [-2.45, 53.38, -2.05, 53.58], start: '2025-05-01', end: '2025-08-31' }
};

function maskClouds(img) {
  // Scene Classification: drop cloud shadow (3), medium/high cloud (8, 9), cirrus (10) and snow (11)
  var scl = img.select('SCL');
  var ok = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  return img.updateMask(ok);
}

var VIS = { bands: ['B4', 'B3', 'B2'], min: 0, max: 2600, gamma: 1.25 };

Object.keys(AREAS).forEach(function (name) {
  var a = AREAS[name];
  var region = ee.Geometry.Rectangle(a.box, null, false);
  var composite = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(region)
    .filterDate(a.start, a.end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
    .map(maskClouds)
    .median()
    .clip(region);

  var rgb = composite.visualize(VIS);
  Map.addLayer(rgb, {}, name);

  print(name, rgb.getThumbURL({ region: region, dimensions: 1920, format: 'jpg', crs: 'EPSG:3857' }));

  Export.image.toDrive({
    image: rgb,
    description: 'orbit_' + name + '_s2_truecolour',
    folder: 'orbit-site',
    region: region,
    scale: name === 'himachal' ? 60 : 10,
    crs: 'EPSG:3857',
    maxPixels: 1e10
  });
});

Map.centerObject(ee.Geometry.Point([78.2, 31.6]), 9);
