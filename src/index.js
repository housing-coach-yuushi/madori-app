import JSZip from "jszip";
import FileSaver from 'file-saver';
import FPS from 'fps-now';

import { BlueprintJS } from './scripts/blueprint.js';
import {
    EVENT_LOADED, EVENT_NOTHING_2D_SELECTED, EVENT_CORNER_2D_CLICKED, EVENT_WALL_2D_CLICKED,
    EVENT_ROOM_2D_CLICKED, EVENT_WALL_CLICKED, EVENT_ROOM_CLICKED, EVENT_NO_ITEM_SELECTED,
    EVENT_ITEM_SELECTED, EVENT_GLTF_READY
} from './scripts/core/events.js';
import { Configuration, configDimUnit, viewBounds, itemStatistics } from './scripts/core/configuration.js';
import { availableDimUnits, dimMeter, TEXTURE_NO_PREVIEW } from './scripts/core/constants.js';
import QuickSettings from 'quicksettings';

import { Dimensioning } from './scripts/core/dimensioning.js';
import { ParametricsInterface } from './scripts/ParametricsInterface.js';

import * as floor_textures_json from './floor_textures.json';
import * as wall_textures_json from './wall_textures.json';
import * as default_room_json from './design.json';

const fps = FPS.of({ x: 0, y: 0 });
fps.start();


let default_room = JSON.stringify(default_room_json);
let startY = 0;
let panelWidths = 200;
let uxInterfaceHeight = 450;
let subPanelsHeight = 460;
let floor_textures = floor_textures_json;//['default'];
let floor_texture_keys = Object.keys(floor_textures);

let wall_textures = wall_textures_json;//['default'];
let wall_texture_keys = Object.keys(wall_textures);

let blueprint3d = null;

let app_parent = document.getElementById('bp3d-js-app');

let configurationHelper = null;
let floorplanningHelper = null;
let roomplanningHelper = null;


let settingsViewer2d = null;
let settingsSelectedCorner = null;
let settingsSelectedWall = null;
let settingsSelectedRoom = null;

let settingsSelectedRoom3D = null;
let settingsSelectedWall3D = null;

let settingsViewer3d = null;
let uxInterface = null;

let parametricContextInterface = null;
let doorsData = {
    'Door Type 1': { src: 'assets/doors/DoorType1.png', type: 1 },
    'Door Type 2': { src: 'assets/doors/DoorType2.png', type: 2 },
    'Door Type 3': { src: 'assets/doors/DoorType3.png', type: 3 },
    'Door Type 4': { src: 'assets/doors/DoorType4.png', type: 4 },
    'Door Type 5': { src: 'assets/doors/DoorType5.png', type: 5 },
    'Door Type 6': { src: 'assets/doors/DoorType6.png', type: 6 },
};
let doorTypes = Object.keys(doorsData);
let opts = {
    viewer2d: {
        id: 'bp3djs-viewer2d',
        viewer2dOptions: {
            'corner-radius': 12.5,
            'boundary-point-radius': 5.0,
            'boundary-line-thickness': 2.0,
            'boundary-point-color': '#030303',
            'boundary-line-color': '#090909',
            pannable: true,
            zoomable: true,
            scale: false,
            rotate: true,
            translate: true,
            dimlinecolor: '#3E0000',
            dimarrowcolor: '#FF0000',
            dimtextcolor: '#000000',
            pixiAppOptions: {
                resolution: 1,
            },
            pixiViewportOptions: {
                passiveWheel: false,
            }
        },
    },
    viewer3d: {
        id: 'bp3djs-viewer3d',
        viewer3dOptions: {
            occludedWalls: false,
            occludedRoofs: false
        }
    },
    textureDir: "models/textures/",
    widget: false,
    resize: true,
};

function selectFloorTexture(data) {
    if (!data.index) {
        data = settingsSelectedRoom3D.getValue('Floor Textures');
    }
    let floor_texture_pack = floor_textures[data.value];
    if (floor_texture_pack.colormap) {
        settingsSelectedRoom3D.setValue('Floor Texture:', floor_texture_pack.colormap);
    }
    else {
        settingsSelectedRoom3D.setValue('Floor Texture:', TEXTURE_NO_PREVIEW);
    }
    roomplanningHelper.roomTexturePack = floor_texture_pack;
}

function selectWallTexture(data) {
    if (!data.index) {
        if (settingsSelectedWall3D._hidden && !settingsSelectedRoom3D._hidden) {
            data = settingsSelectedRoom3D.getValue('All Wall Textures');
        } else {
            data = settingsSelectedWall3D.getValue('Wall Textures');
        }

    }
    let wall_texture_pack = wall_textures[data.value];
    let colormap = wall_texture_pack.colormap;
    if (settingsSelectedWall3D._hidden && !settingsSelectedRoom3D._hidden) {
        if (colormap) {
            settingsSelectedRoom3D.setValue('All Wall Texture:', colormap);
        }
        else {
            settingsSelectedRoom3D.setValue('All Wall Texture:', TEXTURE_NO_PREVIEW);
        }
        roomplanningHelper.roomWallsTexturePack = wall_texture_pack;
    } else {
        if (colormap) {
            settingsSelectedWall3D.setValue('Wall Texture:', wall_texture_pack.colormap);
        }
        else {
            settingsSelectedWall3D.setValue('Wall Texture:', TEXTURE_NO_PREVIEW);
        }
        roomplanningHelper.wallTexturePack = wall_texture_pack;
    }
}


function selectFloorTextureColor(data) {
    roomplanningHelper.setRoomFloorColor(data);
}

function selectWallTextureColor(data) {

    if (settingsSelectedWall3D._hidden && !settingsSelectedRoom3D._hidden) {
        roomplanningHelper.setRoomWallsTextureColor(data);
    }
    else {
        roomplanningHelper.setWallColor(data);
    }
}

function selectDoorForWall(data) {
    if (!data.index) {
        data = settingsSelectedWall3D.getValue('Select Door');
    }
    let selectedDoor = doorsData[data.value];
    settingsSelectedWall3D.setValue('Door Preview:', selectedDoor.src);
}

function addDoorForWall() {
    let data = settingsSelectedWall3D.getValue('Select Door');
    let selectedDoor = doorsData[data.value];
    roomplanningHelper.addParametricDoorToCurrentWall(selectedDoor.type);
}

function switchViewer() {
    blueprint3d.switchView();
    if (blueprint3d.currentView === 2) {
        uxInterface.setValue("現在のビュー", "フロアプラン");
        settingsViewer3d.hide();
        settingsViewer2d.show();

        settingsSelectedWall3D.hide();
        settingsSelectedRoom3D.hide();
        if (parametricContextInterface) {
            parametricContextInterface.destroy();
            parametricContextInterface = null;
        }

    } else if (blueprint3d.currentView === 3) {
        uxInterface.setValue("現在のビュー", "部屋作成");
        settingsViewer2d.hide();
        settingsSelectedCorner.hide();
        settingsSelectedWall.hide();
        settingsSelectedRoom.hide();
        settingsViewer3d.show();
    }
}

function switchViewer2DToDraw() {
    blueprint3d.setViewer2DModeToDraw();
}

function switchViewer2DToMove() {
    blueprint3d.setViewer2DModeToMove();
}

function switchViewer2DToTransform() {
    blueprint3d.switchViewer2DToTransform();
}

function loadBlueprint3DDesign(filedata) {
    let reader = new FileReader();
    reader.onload = function (event) {
        let data = event.target.result;
        blueprint3d.model.loadSerialized(data);
    };
    reader.readAsText(filedata);
}

function loadLockedBlueprint3DDesign(filedata) {
    let reader = new FileReader();
    reader.onload = function (event) {
        let data = event.target.result;
        blueprint3d.model.loadLockedSerialized(data);
    };
    reader.readAsText(filedata);
}

function saveBlueprint3DDesign() {
    let data = blueprint3d.model.exportSerialized();
    let a = window.document.createElement('a');
    let blob = new Blob([data], { type: 'text' });
    a.href = window.URL.createObjectURL(blob);
    a.download = 'design.blueprint3d';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function saveBlueprint3D() {
    blueprint3d.roomplanner.exportSceneAsGTLF();
}

function exportDesignAsPackage() {
    function getWallTextureImages(texobject, pre_image_paths) {
        let image_paths = [];
        if (!texobject) {
            return image_paths;
        }
        if (texobject.normalmap && !pre_image_paths.includes(texobject.normalmap)) {
            image_paths.push(texobject.normalmap);
        }
        if (texobject.colormap && !pre_image_paths.includes(texobject.colormap)) {
            image_paths.push(texobject.colormap);
        }
        if (texobject.roughnessmap && !pre_image_paths.includes(texobject.roughnessmap)) {
            image_paths.push(texobject.roughnessmap);
        }
        if (texobject.ambientmap && !pre_image_paths.includes(texobject.ambientmap)) {
            image_paths.push(texobject.ambientmap);
        }
        if (texobject.bumpmap && !pre_image_paths.includes(texobject.bumpmap)) {
            image_paths.push(texobject.bumpmap);
        }
        return image_paths;
    }

    let designFile = blueprint3d.model.exportSerialized();
    let jsonDesignFile = JSON.parse(designFile);
    let floorplan = jsonDesignFile.floorplan || jsonDesignFile.floorplanner;
    let items = jsonDesignFile.items;
    let images = [];
    let models = [];
    let i = 0;
    for (i = 0; i < floorplan.walls.length; i++) {
        let wall = floorplan.walls[i];
        images = images.concat(getWallTextureImages(wall.frontTexture, images));
        images = images.concat(getWallTextureImages(wall.backTexture, images));
    }
    Object.values(floorplan.newFloorTextures).forEach((texturePack) => {
        images = images.concat(getWallTextureImages(texturePack, images));
        console.log("TEXTURE PACK ", texturePack);
    });
    // for (i = 0; i < floorplan.newFloorTextures.length; i++) {
    //     let roomTexture = floorplan.newFloorTextures[i];
    //     console.log(roomTexture);

    // }
    for (i = 0; i < items.length; i++) {
        let item = items[i];
        if (!item.isParametric && !models.includes(item.modelURL)) {
            models.push(item.modelURL);
        }
    }

    let fetched_image_files = [];
    let fetched_model_files = [];

    function writeZip() {
        if (!fetched_image_files.length === images.length && !fetched_model_files.length === models.length) {
            return;
        }
    }

    let zip = new JSZip();
    zip.file('design.blueprint3d', designFile);

    //Adding the zip files from an url
    //Taken from https://medium.com/@joshmarinacci/a-little-fun-with-zip-files-4058812abf92
    for (i = 0; i < images.length; i++) {
        let image_path = images[i];
        const imageBlob = fetch(image_path).then(response => {
            if (response.status === 200) {
                return response.blob();
            }
            return Promise.reject(new Error(response.statusText));
        });
        zip.file(image_path, imageBlob); //, { base64: false }); //, { base64: true }
    }
    for (i = 0; i < models.length; i++) {
        let model_path = models[i];
        const gltfBlob = fetch(model_path).then(response => {
            if (response.status === 200) {
                return response.blob();
            }
            return Promise.reject(new Error(response.statusText));
        });
        zip.file(model_path, gltfBlob); //, { base64: false }); //, { base64: true }
    }
    zip.generateAsync({ type: "blob" }).then(function (content) {
        FileSaver.saveAs(content, "YourBlueprintProject.zip");
    });

    // let a = window.document.createElement('a');
    // let blob = new Blob([zip.toBuffer()], { type: 'octet/stream' });
    // a.href = window.URL.createObjectURL(blob);
    // a.download = 'YourBlueprintProject.zip';
    // document.body.appendChild(a);
    // a.click();
    // document.body.removeChild(a);
}

// document.addEventListener('DOMContentLoaded', function() {
console.log('ON DOCUMENT READY ');


Configuration.setValue(viewBounds, 10000);//In CMS

blueprint3d = new BlueprintJS(opts);
Configuration.setValue(configDimUnit, dimMeter);
Configuration.setValue(itemStatistics, false);

configurationHelper = blueprint3d.configurationHelper;
floorplanningHelper = blueprint3d.floorplanningHelper;
roomplanningHelper = blueprint3d.roomplanningHelper;

blueprint3d.model.addEventListener(EVENT_LOADED, function () { console.log('LOAD SERIALIZED JSON ::: '); });
blueprint3d.floorplanner.addFloorplanListener(EVENT_NOTHING_2D_SELECTED, function () {
    settingsSelectedCorner.hide();
    settingsSelectedWall.hide();
    settingsSelectedRoom.hide();
    settingsViewer2d.hideControl('Delete');
});
blueprint3d.floorplanner.addFloorplanListener(EVENT_CORNER_2D_CLICKED, function (evt) {
    settingsSelectedCorner.show();
    settingsSelectedWall.hide();
    settingsSelectedRoom.hide();
    settingsViewer2d.showControl('Delete');
    settingsSelectedCorner.setValue('cornerElevation', Dimensioning.cmToMeasureRaw(evt.item.elevation));
});
blueprint3d.floorplanner.addFloorplanListener(EVENT_WALL_2D_CLICKED, function (evt) {
    settingsSelectedCorner.hide();
    settingsSelectedWall.show();
    settingsSelectedRoom.hide();
    settingsViewer2d.showControl('Delete');
    settingsSelectedWall.setValue('wallThickness', Dimensioning.cmToMeasureRaw(evt.item.thickness));
});
blueprint3d.floorplanner.addFloorplanListener(EVENT_ROOM_2D_CLICKED, function (evt) {
    settingsSelectedCorner.hide();
    settingsSelectedWall.hide();
    settingsSelectedRoom.show();
    settingsSelectedRoom.setValue('roomName', evt.item.name);
});

blueprint3d.roomplanner.addRoomplanListener(EVENT_ITEM_SELECTED, function (evt) {
    settingsSelectedWall3D.hide();
    settingsSelectedRoom3D.hide();
    let itemModel = evt.itemModel;
    if (parametricContextInterface) {
        parametricContextInterface.destroy();
        parametricContextInterface = null;
    }
    if (itemModel.isParametric) {
        parametricContextInterface = new ParametricsInterface(itemModel.parametricClass, blueprint3d.roomplanner);
    }
});

blueprint3d.roomplanner.addRoomplanListener(EVENT_NO_ITEM_SELECTED, function () {
    settingsSelectedWall3D.hide();
    settingsSelectedRoom3D.hide();
    if (parametricContextInterface) {
        parametricContextInterface.destroy();
        parametricContextInterface = null;
    }
});
blueprint3d.roomplanner.addRoomplanListener(EVENT_WALL_CLICKED, function (evt) {
    settingsSelectedWall3D.show();
    settingsSelectedRoom3D.hide();
    if (parametricContextInterface) {
        parametricContextInterface.destroy();
        parametricContextInterface = null;
    }
});
blueprint3d.roomplanner.addRoomplanListener(EVENT_ROOM_CLICKED, function (evt) {
    settingsSelectedWall3D.hide();
    settingsSelectedRoom3D.show();
    if (parametricContextInterface) {
        parametricContextInterface.destroy();
        parametricContextInterface = null;
    }
});
blueprint3d.roomplanner.addRoomplanListener(EVENT_GLTF_READY, function (evt) {
    let data = evt.gltf;
    let a = window.document.createElement('a');
    let blob = new Blob([data], { type: 'text' });
    a.href = window.URL.createObjectURL(blob);
    a.download = 'design.gltf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

// console.log(default_room);
blueprint3d.model.loadSerialized(default_room);


if (!opts.widget) {
    uxInterface = QuickSettings.create(0, 0, 'Marori APP', app_parent);
    settingsViewer2d = QuickSettings.create(0, 0, '2Dビュー', app_parent);
    settingsSelectedCorner = QuickSettings.create(0, 0, 'コーナー設定', app_parent);
    settingsSelectedWall = QuickSettings.create(0, 0, '壁設定', app_parent);
    settingsSelectedRoom = QuickSettings.create(0, 0, '部屋設定', app_parent);
    settingsViewer3d = QuickSettings.create(0, 0, '3Dビュー', app_parent);
    settingsSelectedWall3D = QuickSettings.create(0, 0, '壁設定', app_parent);
    settingsSelectedRoom3D = QuickSettings.create(0, 0, '部屋設定', app_parent);


    uxInterface.addButton('表示切替', switchViewer);
    uxInterface.addHTML('現在のビュー', 'フロアプラン');

    uxInterface.bindDropDown('configDimUnit', availableDimUnits, configurationHelper);


    uxInterface.addFileChooser("デザイン読込", "デザイン読込", ".blueprint3d", loadBlueprint3DDesign);
    uxInterface.addButton('デザイン保存', saveBlueprint3DDesign);
    uxInterface.addButton('GLTF出力', saveBlueprint3D);
    uxInterface.addButton('プロジェクト出力 (blueprint-py)', exportDesignAsPackage);
    uxInterface.addButton('リセット', blueprint3d.model.reset.bind(blueprint3d.model));

    settingsViewer2d.addButton('描画モード', switchViewer2DToDraw);
    settingsViewer2d.addButton('移動モード', switchViewer2DToMove);
    settingsViewer2d.addButton('変形モード', switchViewer2DToTransform);
    settingsViewer2d.addButton('削除', floorplanningHelper.deleteCurrentItem.bind(floorplanningHelper));

    settingsViewer2d.bindBoolean('グリッド吸着', configurationHelper.snapToGrid, configurationHelper);
    settingsViewer2d.bindBoolean('定規表示 (Drag)', configurationHelper.directionalDrag, configurationHelper);
    settingsViewer2d.bindBoolean('X軸固定', configurationHelper.dragOnlyX, configurationHelper);
    settingsViewer2d.bindBoolean('Y軸固定', configurationHelper.dragOnlyY, configurationHelper);
    settingsViewer2d.bindBoolean('統計情報', configurationHelper.itemStatistics, configurationHelper);
    settingsViewer2d.bindRange('吸着許容値', 1, 200, configurationHelper.snapTolerance, 1, configurationHelper);
    settingsViewer2d.bindRange('グリッド間隔', 10, 200, configurationHelper.gridSpacing, 1, configurationHelper);
    settingsViewer2d.bindNumber('境界 X', 1, 200, configurationHelper.boundsX, 1, configurationHelper);
    settingsViewer2d.bindNumber('境界 Y', 1, 200, configurationHelper.boundsY, 1, configurationHelper);

    settingsSelectedCorner.bindRange('角の高さ', 1, 500, floorplanningHelper.cornerElevation, 1, floorplanningHelper);
    settingsSelectedWall.bindRange('壁厚', 0.2, 1, floorplanningHelper.wallThickness, 0.01, floorplanningHelper);
    settingsSelectedRoom.bindText('部屋名', floorplanningHelper.roomName, floorplanningHelper);

    settingsSelectedRoom3D.addDropDown('Floor Textures', floor_texture_keys, selectFloorTexture);
    settingsSelectedRoom3D.addImage('Floor Texture:', floor_textures[floor_texture_keys[0]].colormap || TEXTURE_NO_PREVIEW, null);
    settingsSelectedRoom3D.addColor('Floor Texture Color:', floor_textures[floor_texture_keys[0]].color || '#FFFFFF', selectFloorTextureColor);
    settingsSelectedRoom3D.addButton('Apply', selectFloorTexture);

    settingsSelectedRoom3D.addDropDown('All Wall Textures', wall_texture_keys, selectWallTexture);
    settingsSelectedRoom3D.addImage('All Wall Texture:', wall_textures[wall_texture_keys[0]].colormap || TEXTURE_NO_PREVIEW, selectWallTexture);
    settingsSelectedRoom3D.addColor('All Wall Texture Color:', wall_textures[wall_texture_keys[0]].color || '#FFFFFF', selectWallTextureColor);
    settingsSelectedRoom3D.addButton('Apply', selectWallTexture);

    settingsSelectedWall3D.addDropDown('Wall Textures', wall_texture_keys, selectWallTexture);
    settingsSelectedWall3D.addImage('Wall Texture:', wall_textures[wall_texture_keys[0]].colormap || TEXTURE_NO_PREVIEW, null);
    settingsSelectedWall3D.addColor('Wall Texture Color:', wall_textures[wall_texture_keys[0]].color || '#FFFFFF', selectWallTextureColor);
    settingsSelectedWall3D.addButton('Apply', selectWallTexture);

    settingsSelectedWall3D.addDropDown('Select Door', doorTypes, selectDoorForWall);
    settingsSelectedWall3D.addImage('Door Preview:', doorsData[doorTypes[0]].src, null);
    settingsSelectedWall3D.addButton('Add', addDoorForWall);

    settingsViewer3d.addHTML('ヒント:', '<p>クリック＆ドラッグで部屋を360°回転できます</p><p>部屋アイテムを追加: <ul><li>パラメトリックドアを追加</li><li>その他のアイテム（近日公開）</li></ul></p><p>アイテム（ピンクのボックスやドア）をドラッグして配置してください</p>');


    uxInterface.setWidth(panelWidths);
    uxInterface.setHeight(uxInterfaceHeight);


    settingsViewer2d.hideControl('Delete');

    settingsViewer2d.setWidth(panelWidths);
    settingsViewer3d.setWidth(panelWidths);


    settingsViewer2d.setHeight(subPanelsHeight);
    settingsViewer3d.setHeight(subPanelsHeight);



    uxInterface.setPosition(app_parent.clientWidth - panelWidths, startY);
    settingsViewer2d.setPosition(app_parent.clientWidth - panelWidths, startY + uxInterfaceHeight);
    settingsViewer3d.setPosition(app_parent.clientWidth - panelWidths, startY + uxInterfaceHeight);


    settingsSelectedCorner.hide();
    settingsSelectedWall.hide();
    settingsSelectedRoom.hide();

    settingsViewer3d.hide();
    settingsSelectedWall3D.hide();
    settingsSelectedRoom3D.hide();
}