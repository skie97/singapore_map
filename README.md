# A simple Power BI visual with Singapore as a base map
In order to address the difficulty of mapping geo-rectified data in Power BI Desktop without an internet connection, a simple custom visual with Singapore as a base map was created. Although it is hard coded, the map data can be swapped with any other country or feature and the visual easily recompiled.

## How to use
The latitude and longitude data need to be in **WGS84 DD format** typically found in any kml, geojson, etc. Category data can simply be a name. Currently it's not used but can be used to display labels if there are not too many data points.

The data is currently displayed as red dots of 50% opacity and of radius 3.

The runways are also drawn in as the main purpose of this display is to understand activities near and around the runways in Singapore. i.e. Bird activity, kites and drone activity, etc.

## TODO:
- Settings to
    - Change dot size
    - Change dot colour
    - Enable Category Label
    - Category label font settings
<<<<<<< HEAD
    - Disable runway display (for a more general visual)
=======
    - Disable runway display
>>>>>>> 4ee184195775207585f403ef3cfa62063dd44ffc
