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
import { ExtendedFeature, ExtendedFeatureCollection, ExtendedGeometryCollection, GeoIdentityTransform, GeoPath, GeoPermissibleObjects, GeoProjection } from "d3";
import { dataRoleHelper } from "powerbi-visuals-utils-dataviewutils";

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

export class Visual implements IVisual {
    private svg: Selection<SVGElement>;
    private settings: VisualSettings;
    private mapContainer: Selection<SVGElement>;
    private waterSvg: Selection<SVGElement>;
    private landSvg: d3.Selection<SVGElement, any, any, any>;
                     // Selection<SVGElement> doesn't allow the attr("d") to be assigned.
                     // UPDATE: Seems that it's not accepting a GeoPath<any, GeoPermissibleObjects>
                     // Managed to shoeout the output into a GeoPath<any, any> not entirely understanding why it works.
                     // TODO: Need to study what is the right Selection<X,X,X,X> to take.
    private runwaySvg: Selection<SVGElement>;
    private baseMap: Selection<SVGElement>;
    private host: IVisualHost;
    private geoData: geoJsonData;
    private viewModel: ViewModel;
    private selectionManager: ISelectionManager;

    private datapointSelection: d3.Selection<d3.BaseType, any, d3.BaseType, any>;

    constructor(options: VisualConstructorOptions) {
    this.svg = d3.select(options.element).append('svg');
        this.host = options.host;
        this.selectionManager = options.host.createSelectionManager();

        this.selectionManager.registerOnSelectCallback(() => {
            this.syncSelectionState(this.datapointSelection, <ISelectionId[]>this.selectionManager.getSelectionIds());
        });
        // Order of append is important as it's a last in, on top.
        this.waterSvg = this.svg.append('rect');
        this.mapContainer = this.svg.append('g').classed('mapContainer', true);
        this.baseMap = this.mapContainer.append('g').classed('baseMap', true);
        this.geoData = new geoJsonData();
        this.landSvg = this.baseMap.append("path")
            .classed("land", true)
            .datum({type: "FeatureCollection", features: this.geoData.data.features});
        this.runwaySvg = this.baseMap.append("path")
            .classed("runway", true)
            .datum({type: "FeatureCollection", features: this.geoData.runwayData.features});
    }

    public update(options: VisualUpdateOptions) {
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
        
        let projection: d3.GeoProjection = d3.geoMercator()
            .center(mapCentre)
            .scale(this.getMapScale(width, height))
            .translate([width /2, height / 2]);
        
        this.landSvg
            .attr("d", <GeoPath<any,any>>d3.geoPath().projection(projection))
            .attr("fill", "white")
            .attr("stroke", "grey")
            .attr("stroke-width", 1);
        
        this.runwaySvg
            .attr("d", <GeoPath<any,any>>d3.geoPath().projection(projection))
            .attr("fill", "black")
            .attr("stroke", "black")
            .attr("stroke-width", 1);

        this.datapointSelection = this.mapContainer
            .selectAll(".datapoint")
            .data(this.viewModel.datapoints);
        
        const datapointsMerged = this.datapointSelection
            .enter()
            .append("circle")
            .classed("datapoint", true)
            .merge(<any>this.datapointSelection)
        
        datapointsMerged
            .attr("cx", d => projection([d.longitude, d.latitude])[0])
            .attr("cy", d => projection([d.longitude, d.latitude])[1])
            .attr("fill", "red")
            .style("fill-opacity", 0.5)
            .attr("r", 3)

        this.syncSelectionState(
            datapointsMerged,
            <ISelectionId[]>this.selectionManager.getSelectionIds()
        );

        datapointsMerged.on('click', (d) => {        
            this.selectionManager
                .select(d.selectionId)
                .then((ids: ISelectionId[]) => { // Important step to ensure that the selection is displayed.
                    this.syncSelectionState(datapointsMerged, ids);
                })
        });

        this.datapointSelection.exit().remove();
    }

    // Helper function to ensure map scale is always correct.
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
            const opacity: number = 0.5;
            selection
                .style("fill-opacity", opacity)

            return;
        }

        const self: this = this;

        selection.each(function (datapoint: Datapoint) {
            const isSelected: boolean = self.isSelectionIdInArray(selectionIds, datapoint.selectionId);

            const opacity: number = isSelected
                ? 1.0
                : 0.15;

            d3.select(this)
                .style("fill-opacity", opacity)
        });
    }

    private isSelectionIdInArray(selectionIds: ISelectionId[], selectionId: ISelectionId): boolean {
        if (!selectionIds || !selectionId) {
            return false;
        }

        return selectionIds.some((currentSelectionId: ISelectionId) => {
            return currentSelectionId.includes(selectionId);
        });
    }
}