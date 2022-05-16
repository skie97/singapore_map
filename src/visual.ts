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
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import {geoJsonData} from "./sg_geojson";

import { VisualSettings } from "./settings";
import { buffer, ExtendedFeature, ExtendedFeatureCollection, ExtendedGeometryCollection, GeoIdentityTransform, GeoPath, GeoPermissibleObjects, GeoProjection } from "d3";
import { dataRoleHelper } from "powerbi-visuals-utils-dataviewutils";
import { deflate, inflate } from "pako";
import { encode, decode } from "uint8-to-base64";

const mapGeoJsonURL: string = ""

interface Datapoint {
    category: PrimitiveValue;
    latitude: number;
    longitude: number;
    selectionId: ISelectionId;
}

interface ViewModel {
    datapoints: Datapoint[],
    num_datapoints: number
}

function visualTransform(options: VisualUpdateOptions, host: IVisualHost): ViewModel {
    let dataViews = options.dataViews;
    let viewModel: ViewModel = {
        datapoints: [],
        num_datapoints: 0
    }

    if (!dataViews
        || !dataViews[0]
        || !dataViews[0].table
        || !dataViews[0].table.columns
        || !dataViews[0].table.rows
        || !dataRoleHelper.hasRoleInDataView(dataViews[0], "category")
        || !dataRoleHelper.hasRoleInDataView(dataViews[0], "latitude")
        || !dataRoleHelper.hasRoleInDataView(dataViews[0], "longitude")) {
        return viewModel;
    }
    
    let colIdx = {};

    for (let i = 0; i < dataViews[0].table.columns.length; i++) {
        if ("category" in dataViews[0].table.columns[i].roles) {
            colIdx["category"] = i;
        } else if ("latitude" in dataViews[0].table.columns[i].roles) {
            colIdx["latitude"] = i;
        } else if ("longitude" in dataViews[0].table.columns[i].roles) {
            colIdx["longitude"] = i;
        }
    }
    let tableDataview = dataViews[0].table;

    tableDataview.rows.forEach((row: powerbi.DataViewTableRow, rowIndex: number) => {
        let datapoint: Datapoint = {
            category: row[colIdx["category"]],
            latitude: <number>row[colIdx["latitude"]],
            longitude: <number>row[colIdx["longitude"]],
            selectionId: host.createSelectionIdBuilder()
                .withTable(tableDataview, rowIndex)
                .createSelectionId()
        }
        viewModel.datapoints.push(datapoint);
        viewModel.num_datapoints++;
    });

    return viewModel;
}

function toRad(deg: number): number {
    return deg * Math.PI / 180.0;
}

function greatCircleRad(dPointA: Datapoint, dPointB: Datapoint): number {
    return Math.atan(Math.sqrt(
        ( Math.cos(toRad(dPointB.latitude)) * Math.sin(toRad(Math.abs(dPointA.longitude - dPointB.longitude))) ) ** 2
        +
        ( Math.cos(toRad(dPointA.latitude))* Math.sin(toRad(dPointB.latitude)) 
        - 
        Math.sin(toRad(dPointA.latitude)) * Math.cos(toRad(dPointB.latitude)) * Math.cos(toRad(Math.abs(dPointA.longitude - dPointB.longitude))) ) ** 2
        ) / 
        (
        Math.sin(toRad(dPointA.latitude)) * Math.sin(toRad(dPointB.latitude))
        + 
        Math.cos(toRad(dPointA.latitude)) * Math.cos(toRad(dPointB.latitude)) * Math.cos(toRad(Math.abs(dPointA.longitude - dPointB.longitude)))
        ));
}

export class Visual implements IVisual {
    private svg: Selection<SVGElement>;
    private settings: VisualSettings;
    private mapContainer: Selection<SVGElement>;
    private waterSvg: Selection<SVGElement>;
    private sgSvg: d3.Selection<SVGElement, any, any, any>;
                     // Selection<SVGElement> doesn't allow the attr("d") to be assigned.
                     // UPDATE: Seems that it's not accepting a GeoPath<any, GeoPermissibleObjects>
                     // Managed to shoeout the output into a GeoPath<any, any> not entirely understanding why it works.
                     // UPDATE: The above issue is because the wrong @types/d3-selection was pulled.
                     // in the default pbiviz project setup. Need to change the @types/d3 to the latest v5 version
                     // in the package.json dep.
                     // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/48407
    private mySvg: Selection<SVGElement>;
    private indoSvg: Selection<SVGElement>;
    private runwaySvg: Selection<SVGElement>;
    private aerodromeBoundarySvg: Selection<SVGElement>;
    private baseMap: Selection<SVGElement>;
    private baseOtherMap: Selection<SVGElement>;
    private host: IVisualHost;
    private geoData: geoJsonData;
    private viewModel: ViewModel;
    private selectionManager: ISelectionManager;
    private externalData: any;
    private oldVisualOptions: VisualUpdateOptions = null;

    private datapointSelection: d3.Selection<d3.BaseType, any, d3.BaseType, any>; // TODO: figure out why it's declared like this.

    constructor(options: VisualConstructorOptions) {
        this.svg = d3.select(options.element).append('svg');
        this.host = options.host;
        this.selectionManager = options.host.createSelectionManager();

        this.selectionManager.registerOnSelectCallback(() => {
            this.syncSelectionState(this.datapointSelection, <ISelectionId[]>this.selectionManager.getSelectionIds());
        });
        // Order of append is important for correct layering of the display as it's a last in, on top. It's like a stack.
        this.waterSvg = this.svg.append('rect');
        this.mapContainer = this.svg.append('g').classed('mapContainer', true);
        this.baseOtherMap = this.mapContainer.append('g').classed('baseOtherMap', true);
        this.baseMap = this.mapContainer.append('g').classed('baseMap', true);
        this.geoData = new geoJsonData();

        // This uses the pako (zlib implementation with the types from DefinitelyTyped)
        // A useful website to check is : https://www.typescriptlang.org/dt/search?search=zlib and https://github.com/DefinitelyTyped/DefinitelyTyped
        // Source link is https://stackoverflow.com/questions/38224232/how-to-consume-npm-modules-from-typescript
        this.geoData.runwayData = JSON.parse(String.fromCharCode.apply(null,inflate(decode(this.geoData.runwayCompress))));
        this.geoData.aerodromeBoundaryData = JSON.parse(String.fromCharCode.apply(null,inflate(decode(this.geoData.aerodromeBoundaryCompress))));
        this.geoData.data = JSON.parse(new TextDecoder().decode(inflate(decode(this.geoData.dataCompress))));
        // this.geoData.data = JSON.parse(String.fromCharCode.apply(null,inflate(decode(this.geoData.dataCompress))));
        this.sgSvg = this.baseMap.append("path")
            .classed("land", true)
            .datum({type: "FeatureCollection", features: this.geoData.data.features});
        this.runwaySvg = this.baseMap.append("path")
            .classed("runway", true)
            .datum({type: "FeatureCollection", features: this.geoData.runwayData.features});
        this.aerodromeBoundarySvg = this.baseMap.append("path")
            .classed("aerodromeBoundary", true)
            .datum({type: "FeatureCollection", features: this.geoData.aerodromeBoundaryData.features});
        
        let headers = new Headers();
        headers.append('Accept', 'application/json');

        fetch(mapGeoJsonURL , {
            method: 'GET',
            headers: headers
        })
            .then(response => response.json())
            .then(data => {
                this.externalData = data;
                this.mySvg = this.baseOtherMap.append("path")
                    .classed("otherLand", true)
                    .datum({type: "FeatureCollection", features: this.externalData.features});
                if(this.oldVisualOptions != null) {
                    this.update(this.oldVisualOptions);
                };
            })
            .catch(error => console.log(error));
        const toCompress: string = JSON.stringify(this.geoData.aerodromeBoundaryData);
        var enc = new TextEncoder();
        const uArray: Uint8Array = enc.encode(toCompress);
        const compress = deflate(uArray);
        var dec = new TextDecoder();
        const base64Data = this.geoData.aerodromeBoundaryCompress;
        // const base64Data = encode(compress);
        // console.log(base64Data);
        const rawData = decode(base64Data);
        console.log(String.fromCharCode.apply(null,inflate(rawData)));
    }

    public update(options: VisualUpdateOptions) {
        this.oldVisualOptions = options; // Save the old options to redraw once the data arrives.

        this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
        this.viewModel = visualTransform(options, this.host);

        let width = options.viewport.width;
        let height = options.viewport.height;
        let mapCentre: [number, number] = [103.847586, 1.335832];
        
        this.svg
            .attr('width', width)
            .attr('height', height);

        this.waterSvg
            .attr('width', width)
            .attr('height', height)
            .attr('fill', this.settings.map.waterColor);
        
        let projection: d3.GeoProjection = d3.geoMercator() // Save the projection so that you can reuse it to draw all the graphics.
            .center(mapCentre)                              // It is basically a mapping function from one coordinate system to the display coordinate system.
            .scale(this.getMapScale(width, height))
            .translate([width /2, height / 2]);
        
        this.sgSvg
            .attr("d", d3.geoPath().projection(projection))
            .attr("fill", this.settings.map.landColor)
            .attr("stroke", "grey")
            .attr("stroke-width", this.settings.map.landStrokeWidth);

        if(this.mySvg != null) {
            this.mySvg
                .attr("d", d3.geoPath().projection(projection))
                .attr("fill", this.settings.map.landColor)
                .attr("stroke", "grey")
                .attr("stroke-width", this.settings.map.landStrokeWidth);
        }

        if(this.settings.map.showRunways){
            this.runwaySvg
                .attr("d", d3.geoPath().projection(projection))
                .attr("fill", "black")
                .attr("stroke", "black")
                .attr("stroke-width", 1);
        } else {
            this.runwaySvg.attr("d", null);
        }

        if(this.settings.map.showAerodromeBoundary){
            this.aerodromeBoundarySvg
                .attr("d", d3.geoPath().projection(projection))
                .attr("fill", "transparent")
                .attr("stroke", "red")
                .attr("stroke-width", 1)
                .attr("stroke-dasharray", "4 1");
        } else {
            this.aerodromeBoundarySvg.attr("d", null);
        }

        this.datapointSelection = this.mapContainer
            .selectAll(".datapoint")
            .data(this.viewModel.datapoints);
        
        const datapointsMerged = this.datapointSelection
            .enter()
            .append("circle")
            .classed("datapoint", true)
            .merge(<any>this.datapointSelection);
        
        datapointsMerged
            .attr("cx", d => projection([d.longitude, d.latitude])[0])
            .attr("cy", d => projection([d.longitude, d.latitude])[1])
            .attr("fill", this.settings.dataPoint.fill)
            .style("fill-opacity", 0.5) // Gotcha here is the fill-opacity is set as a style. Seems to work as an attr too, but I guess all must be the same.
            .attr("r", this.settings.dataPoint.dotSize);

        this.syncSelectionState( // This helper function is called to ensure that the elements take selection into account.
            datapointsMerged,
            <ISelectionId[]>this.selectionManager.getSelectionIds()
        );

        datapointsMerged.on('click', (d) => {        
            this.selectionManager
                .select(d.selectionId)
                .then((ids: ISelectionId[]) => { // Important step to ensure that the selection is displayed. Otherwise it is only refreshed on another update.
                    this.syncSelectionState(datapointsMerged, ids);
                    // NOTE: in the default project creation of pbiviz
                    // @types/d3 5.7.21 will pull in the latest d3-selection v2 which is wrong.
                    // because of the link @types/d3-selection@* instead of @types/d3-selection@^1
                    // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/48407
                    // Thus the d3.event will be missing.
                })
        });

        this.datapointSelection.exit().remove();
    }

    // Helper function to ensure map scale is always correct.
    // Might want to modify this when custom map extents are implemented.
    private getMapScale(width: number, height: number): number {
        // scale 100000 against 900x680 is correct size and view.
        return Math.min(width/900*100000, height/680*100000);
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

    private syncSelectionState(
        selection: d3.Selection<any,Datapoint,any,Datapoint>,
        selectionIds: ISelectionId[]
    ): void {
        if (!selection || !selectionIds) {
            return;
        }

        if (!selectionIds.length) {
            const opacity: number = 0.5; // TODO: To store value in the settings. And pass settings object in.
            selection
                .style("fill-opacity", opacity)

            return;
        }

        const self: this = this;

        selection.each(function (datapoint: Datapoint) {
            const isSelected: boolean = self.isSelectionIdInArray(selectionIds, datapoint.selectionId);

            const opacity: number = isSelected
                ? 1.0 // This is hardcoded now, by can set in the settings? Need to modify the function to have the setting variable passed in.
                : 0.15;

            d3.select(this)
                .style("fill-opacity", opacity)
        });
    }

    // Unmodified helper function.
    private isSelectionIdInArray(selectionIds: ISelectionId[], selectionId: ISelectionId): boolean {
        if (!selectionIds || !selectionId) {
            return false;
        }

        return selectionIds.some((currentSelectionId: ISelectionId) => {
            return currentSelectionId.includes(selectionId);
        });
    }
}