const measurementUnitGroups = [
    { label: 'Count', units: [['pcs', 'Pieces (pcs)'], ['pair', 'Pair'], ['set', 'Set'], ['dozen', 'Dozen'], ['box', 'Box'], ['pack', 'Pack'], ['case', 'Case'], ['roll', 'Roll'], ['sheet', 'Sheet'], ['bottle', 'Bottle'], ['bag', 'Bag'], ['can', 'Can'], ['carton', 'Carton'], ['unit', 'Unit']] },
    { label: 'Weight', units: [['mg', 'Milligram (mg)'], ['g', 'Gram (g)'], ['kg', 'Kilogram (kg)'], ['tonne', 'Tonne'], ['oz', 'Ounce (oz)'], ['lb', 'Pound (lb)']] },
    { label: 'Length', units: [['mm', 'Millimeter (mm)'], ['cm', 'Centimeter (cm)'], ['m', 'Meter (m)'], ['km', 'Kilometer (km)'], ['in', 'Inches (in)'], ['ft', 'Foot (ft)'], ['yd', 'Yard (yd)'], ['mi', 'Mile (mi)']] },
    { label: 'Volume', units: [['mL', 'Milliliter (mL)'], ['L', 'Liter (L)'], ['fl oz', 'Fluid ounce (fl oz)'], ['cup', 'Cup'], ['pt', 'Pint (pt)'], ['qt', 'Quart (qt)'], ['gal', 'Gallon (gal)']] },
    { label: 'Area', units: [['cm2', 'Square centimeter (cm²)'], ['m2', 'Square meter (m²)'], ['ft2', 'Square foot (ft²)'], ['yd2', 'Square yard (yd²)'], ['acre', 'Acre']] },
    { label: 'Time', units: [['second', 'Second'], ['minute', 'Minute'], ['hour', 'Hour'], ['day', 'Day'], ['week', 'Week']] }
];

export const measurementUnits = measurementUnitGroups.flatMap(({ units }) => units);

export function legacyMeasurementUnitItemName(itemName, unit) {
    return unit ? `${itemName} [FINTRACK_UNIT:${unit}]` : itemName;
}

export function normalizeMeasurementUnitItem(item) {
    const itemName = String(item.itemName || '');
    const legacyUnit = /\s+\[FINTRACK_UNIT:([^\]]+)\]$/.exec(itemName);
    if (!legacyUnit) return item;
    return {
        ...item,
        itemName: itemName.slice(0, legacyUnit.index),
        unit: item.unit || legacyUnit[1]
    };
}

export function measurementUnitOptions(selected = 'pcs') {
    return measurementUnitGroups.map(({ label, units }) => `<optgroup label="${label}">${units.map(([value, unitLabel]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${unitLabel}</option>`).join('')}</optgroup>`).join('');
}
