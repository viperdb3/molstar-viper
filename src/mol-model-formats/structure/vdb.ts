/**
 * Copyright (c) 2019-2022 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { VdbFile } from '../../mol-io/reader/pdb/schema';
import { pdbToMmCif } from './pdb/to-cif';
import { Task } from '../../mol-task';
import { MmcifFormat } from './mmcif';
import { createModels } from './basic/parser';
import { Column } from '../../mol-data/db';
import { AtomPartialCharge } from './property/partial-charge';
import { Trajectory } from '../../mol-model/structure';
import { ModelFormat } from '../format';
import { createBasic } from './basic/schema';

export { VdbFormat };

type VdbFormat = ModelFormat<VdbFile>

namespace VdbFormat {
    export function is(x?: ModelFormat): x is VdbFormat {
        return x?.kind === 'vdb';
    }

    export function create(vdb: VdbFile): VdbFormat {
        return { kind: 'vdb', name: vdb.id || '', data: vdb };
    }
}

export function trajectoryFromVDB(vdb: VdbFile): Task<Trajectory> {
    return Task.create('Parse VDB', async ctx => {
        await ctx.update('Converting to mmCIF');
        const cif = await pdbToMmCif(vdb);
        const format = MmcifFormat.fromFrame(cif, undefined, VdbFormat.create(vdb));
        const basic = createBasic(format.data.db, true);
        const models = await createModels(basic, format, ctx);
        const partial_charge = cif.categories['atom_site']?.getField('partial_charge');
        if (partial_charge) {
            // TODO works only for single, unsorted model, to work generally
            //      would need to do model splitting again
            if (models.frameCount === 1) {
                const first = models.representative;
                const srcIndex = first.atomicHierarchy.atomSourceIndex;
                const isIdentity = Column.isIdentity(srcIndex);
                const srcIndexArray = isIdentity ? void 0 : srcIndex.toArray({ array: Int32Array });

                const q = partial_charge.toFloatArray();
                const partialCharge = srcIndexArray
                    ? Column.ofFloatArray(Column.mapToArray(srcIndex, i => q[i], Float32Array))
                    : Column.ofFloatArray(q);

                AtomPartialCharge.Provider.set(first, {
                    data: partialCharge,
                    type: 'GASTEIGER' // from PDBQT
                });
            }
        }
        return models;
    });
}