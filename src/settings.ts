/*
 *  Power BI Visualizations
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

import { dataViewObjectsParser } from "powerbi-visuals-utils-dataviewutils";
import DataViewObjectsParser = dataViewObjectsParser.DataViewObjectsParser;

export class VisualSettings extends DataViewObjectsParser {
      public dataPoint: dataPointSettings = new dataPointSettings();
      public map: mapOptions = new mapOptions();
      }

    export class dataPointSettings {
     // Fill
      public fill: string = "#FF0000";
     // Color saturation
      public fillRule: string = "";
     // Text Size
      public fontSize: number = 12;
      public dotSize: number = 3;
     }

     export class mapOptions {
       public centreLat: number = 1.335832;
       public centreLong: number = 103.847586;
       public mapScale: number = 100000;
       public waterColor: string ="#CAF2FF";
       public landColor: string = "#FFFFFF";
       public landStrokeWidth: number = 1;
       public showRunways: boolean = true;
       public showAerodromeBoundary: boolean = true;
       public heatmapRadiusInNM: number = 0;
       
     }

