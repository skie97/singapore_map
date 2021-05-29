/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import DataView = powerbi.DataView;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import * as d3 from "d3";

type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;
import PrimitiveValue = powerbi.PrimitiveValue;
import ISelectionId = powerbi.visuals.ISelectionId;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import {geoJsonData} from "./sg_geojson";

import { VisualSettings } from "./settings";
import { GeoPermissibleObjects } from "d3";
export class Visual implements IVisual {
    private svg: Selection<SVGElement>;
    private settings: VisualSettings;
    private mapContainer: Selection<SVGElement>;
    private waterSvg: Selection<SVGElement>;
    private landSvg;
                     // Selection<SVGElement> doesn't allow the attr("d") to be assigned.
                     // TODO: Need to study what is the right Selection<X,X,X,X> to take.
    private baseMap: Selection<SVGElement>;
    private host: IVisualHost;
    private geoData: geoJsonData;

    constructor(options: VisualConstructorOptions) {
    this.svg = d3.select(options.element).append('svg');
        this.host = options.host;
        // Order of append is important as it's a last in, on top.
        this.waterSvg = this.svg.append('rect');
        this.mapContainer = this.svg.append('g').classed('mapContainer', true);
        this.baseMap = this.mapContainer.append('g').classed('baseMap', true);
        this.geoData = new geoJsonData();
        this.landSvg = this.baseMap.append("path").classed("land", true);
      
    }

    public update(options: VisualUpdateOptions) {
        this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
        
        let width = options.viewport.width;
        let height = options.viewport.height;

        this.svg
            .attr('width', width)
            .attr('height', height);

        this.waterSvg
            .attr('width', width)
            .attr('height', height)
            .attr('fill', this.settings.map.waterColor);
        // centre [103.755335, 1.373943]
        // centre [103.820271, 1.349690]
        // scale 100000 against 900x680 is correct size and view.
        // TODO: Save the projection to reuse for new plottings.
        this.landSvg
            .datum({type: "FeatureCollection", features: this.geoData.data.features})
            .classed("baseMap", true)
            .attr("d", d3.geoPath().projection(d3.geoMercator().center([103.847586, 1.335832]).scale(100000).translate([width /2, height / 2])))
            .attr("fill", "white")
            .attr("stroke", "grey")
            .attr("stroke-width", 1);
    }

    private static parseSettings(dataView: DataView): VisualSettings {
        return <VisualSettings>VisualSettings.parse(dataView);
    }

    /**
     * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the
     * objects and properties you want to expose to the users in the property pane.
     *
     */
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
        return VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options);
    }
}