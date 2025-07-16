/**
 * Copyright (c) 2020-2023 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { presetStaticComponent, StructureRepresentationPresetProvider } from '../../mol-plugin-state/builder/structure/representation-preset';
import { StructureComponentRef, StructureRef } from '../../mol-plugin-state/manager/structure/hierarchy-state';
import { PluginUIComponent } from '../../mol-plugin-ui/base';
import { LociLabels } from '../../mol-plugin-ui/controls';
import { Button } from '../../mol-plugin-ui/controls/common';
import { BackgroundTaskProgress } from '../../mol-plugin-ui/task';
import { Toasts } from '../../mol-plugin-ui/toast';
import { Viewport, ViewportControls } from '../../mol-plugin-ui/viewport';
import { PluginCommands } from '../../mol-plugin/commands';
import { PluginConfig } from '../../mol-plugin/config';
import { PluginContext } from '../../mol-plugin/context';
import { StateObjectRef } from '../../mol-state';
import { Material } from '../../mol-util/material';
import { eachRepr } from '../../mol-plugin-state/helpers/structure-overpaint';

function shinyStyle(plugin: PluginContext) {
    return PluginCommands.Canvas3D.SetSettings(plugin, { settings: {
        renderer: {
            ...plugin.canvas3d!.props.renderer,
        },
        postprocessing: {
            ...plugin.canvas3d!.props.postprocessing,
            occlusion: { name: 'off', params: {} },
            shadow: { name: 'off', params: {} },
            outline: { name: 'off', params: {} },
        }
    } });
}

// function occlusionStyle(plugin: PluginContext) {
//     return PluginCommands.Canvas3D.SetSettings(plugin, { settings: {
//         renderer: {
//             ...plugin.canvas3d!.props.renderer,
//         },
//         postprocessing: {
//             ...plugin.canvas3d!.props.postprocessing,
//             occlusion: { name: 'on', params: {
//                 blurKernelSize: 15,
//                 multiScale: { name: 'off', params: {} },
//                 radius: 5,
//                 bias: 0.8,
//                 samples: 32,
//                 resolutionScale: 1,
//                 color: Color(0x000000),
//             } },
//             outline: { name: 'on', params: {
//                 scale: 1.0,
//                 threshold: 0.33,
//                 color: Color(0x0000),
//                 includeTransparent: true,
//             } },
//             shadow: { name: 'off', params: {} },
//         }
//     } });
// }

// const ligandPlusSurroundings = StructureSelectionQuery('Surrounding Residues (5 \u212B) of Ligand plus Ligand itself', MS.struct.modifier.union([
//     MS.struct.modifier.includeSurroundings({
//         0: StructureSelectionQueries.ligand.expression,
//         radius: 5,
//         'as-whole-residues': true
//     })
// ]));
//
// const ligandSurroundings = StructureSelectionQuery('Surrounding Residues (5 \u212B) of Ligand', MS.struct.modifier.union([
//     MS.struct.modifier.exceptBy({
//         0: ligandPlusSurroundings.expression,
//         by: StructureSelectionQueries.ligand.expression
//     })
// ]));

const PresetParams = {
    ...StructureRepresentationPresetProvider.CommonParams,
};

const CustomMaterial = Material({ roughness: 0.2, metalness: 0 });
let currentRepresentations: 'gaussian-surface' | 'cartoon' = 'gaussian-surface';

export const StructurePreset = StructureRepresentationPresetProvider({
    id: 'preset-structure',
    display: { name: 'Structure' },
    params: () => PresetParams,
    async apply(ref, params, plugin) {
        currentRepresentations = 'cartoon';
        return applyQualityPreset(ref, plugin, 'cartoon', 'lower');
    }
});
export const GaussianSurfacePreset = StructureRepresentationPresetProvider({
    id: 'preset-gaussian',
    display: { name: 'Structure' },
    params: () => PresetParams,
    async apply(ref, params, plugin) {
        currentRepresentations = 'gaussian-surface';
        return applyQualityPreset(ref, plugin, 'gaussian-surface', 'lower');
    }
});

export const QualityMediumPreset = StructureRepresentationPresetProvider({
    id: 'quality-medium',
    display: { name: 'Medium Quality' },
    params: () => PresetParams,
    async apply(ref, params, plugin) {
        return applyQualityPreset(ref, plugin, currentRepresentations, 'medium');
    }
});

export const QualityLowerPreset = StructureRepresentationPresetProvider({
    id: 'quality-lower',
    display: { name: 'Lower Quality' },
    params: () => PresetParams,
    async apply(ref, params, plugin) {
        return applyQualityPreset(ref, plugin, currentRepresentations, 'lower');
    }
});

export const QualityLowestPreset = StructureRepresentationPresetProvider({
    id: 'quality-lowest',
    display: { name: 'Lowest Quality' },
    params: () => PresetParams,
    async apply(ref, params, plugin) {

        return applyQualityPreset(ref, plugin, currentRepresentations, 'lowest');
    }
});


async function applyQualityPreset(ref: StateObjectRef, plugin: PluginContext, typeRepresentation: 'gaussian-surface' | 'cartoon', quality: 'custom' | 'auto' | 'highest' | 'higher' | 'high' | 'medium' | 'low' | 'lower' | 'lowest' | undefined = 'medium') {
    const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref);
    if (!structureCell || !structureCell.obj || !structureCell.obj.data) return {};

    const components = {
        ligand: await presetStaticComponent(plugin, structureCell, 'ligand'),
        polymer: await presetStaticComponent(plugin, structureCell, 'all'),
    };
    const currentStructure = plugin.managers.structure.hierarchy.current.structures[0];

    if (!currentStructure) return {};

    const component = currentStructure.components || [];

    const { update, builder, typeParams } = StructureRepresentationPresetProvider.reprBuilder(plugin, {});

    const isOverpainting = await checkForOverpaint(plugin, component);

    const colorType = isOverpainting ? 'uniform' : 'chain-id';
    const colorParams = isOverpainting ? { value: 0xe9e9e9 } : { palette: (plugin.customState as any).colorPalette };

    const representations = {
        ligand: builder.buildRepresentation(update, components.ligand, {
            type: 'gaussian-surface',
            typeParams: { ...typeParams, quality: quality, material: CustomMaterial, sizeFactor: 0.35 },
            color: colorType,
            colorParams
        }, { tag: 'ligand' }),

        polymer: builder.buildRepresentation(update, components.polymer, {
            type: typeRepresentation,
            typeParams: { ...typeParams, quality, material: CustomMaterial },
            color: colorType,
            colorParams
        }, { tag: 'polymer' }),
    };
    await update.commit({ revertOnError: true });
    await shinyStyle(plugin);
    plugin.managers.interactivity.setProps({ granularity: 'residue' });

    return { components, representations };
}

async function checkForOverpaint(plugin: PluginContext, components: StructureComponentRef[]) {
    let hasOverpaint = false;
    await eachRepr(plugin, components, async (update, repr, overpaintCell) => {
        if (overpaintCell?.transform.ref) {
            hasOverpaint = true;
        }
    });

    return hasOverpaint;
}
export const ShowButtons = PluginConfig.item('showButtons', true);

export class ViewportComponent extends PluginUIComponent {
    async _set(structures: readonly StructureRef[], preset: StructureRepresentationPresetProvider) {
        // await this.plugin.managers.structure.component.clear(structures);
        await this.plugin.managers.structure.component.applyPreset(structures, preset);
    }

    set = async (preset: StructureRepresentationPresetProvider) => {
        await this._set(this.plugin.managers.structure.hierarchy.selection.structures, preset);
    };

    structureCartoonPreset = () => this.set(StructurePreset);
    structureSurfacePreset = () => this.set(GaussianSurfacePreset);
    qualityMediumPreset = () => this.set(QualityMediumPreset);
    qualityLowestPreset = () => this.set(QualityLowestPreset);
    qualityLowerPreset = () => this.set(QualityLowerPreset);

    resetCamera = () => {
        PluginCommands.Camera.Reset(this.plugin, {});
    };
    applyCartoon = () => {
        this.structureCartoonPreset().then(()=> this.resetCamera());
    };
    applySurface = () => {
        this.structureSurfacePreset().then(()=> this.resetCamera());
    };
    applyMedium = () => {
        this.qualityMediumPreset().then(()=> this.resetCamera());
    };
    applyLowest = () =>{
        this.qualityLowestPreset().then(()=> this.resetCamera());
    };
    applyLower = () => {
        this.qualityLowerPreset().then(()=> this.resetCamera());
    }

    get showButtons() {
        return this.plugin.config.get(ShowButtons);
    };

    render() {
        const VPControls = this.plugin.spec.components?.viewport?.controls || ViewportControls;

        return <>
            <Viewport />
            {this.showButtons && <div className='msp-viewport-top-left-controls'>
                <div style={{ marginBottom: '2px' }}>
                    <Button onClick={this.applyCartoon}>Cartoon</Button>
                </div>
                <div style={{ marginBottom: '1px' }}>
                    <Button onClick={this.applySurface}>Surface</Button>
                </div>
                <div style={{ textAlign: 'center' }}><label style={{ fontSize: '12px' }}>Quality:</label></div>
                <div style={{ marginBottom: '2px', marginTop: '1px' }}>
                    <Button style={{ fontSize: '12px', padding: '1px 1px', width: '70px', height: '23px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={this.applyMedium}>Medium</Button>
                </div>
                <div style={{ marginBottom: '2px' }}>
                    <Button style={{ fontSize: '12px', padding: '2px 2px', width: '70px', height: '23px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={this.applyLower}>Lower</Button>
                </div>
                <div style={{ marginBottom: '2px' }}>
                    <Button style={{ fontSize: '12px', padding: '2px 2px', width: '70px', height: '23px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={this.applyLowest}>Lowest</Button>
                </div>
            </div>}
            <VPControls/>
            <BackgroundTaskProgress/>
            <div className='msp-highlight-toast-wrapper'>
                <LociLabels/>
                <Toasts/>
            </div>
        </>;
    }
}