/**
 * Move one item of a list to another position, keeping the order of the others. Both indexes are
 * clamped to the list, and an empty list or an unchanged position returns a copy as it is.
 *
 * @param list - The list to reorder, never mutated
 * @param from - Index of the item to move
 * @param to - Index the item should end up at
 * @returns A new list with the item moved
 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
    const result = [...list];
    if (result.length === 0) return result;

    const source = Math.min(Math.max(from, 0), result.length - 1);
    const target = Math.min(Math.max(to, 0), result.length - 1);
    if (source === target) return result;

    const [item] = result.splice(source, 1);
    result.splice(target, 0, item);
    return result;
}

/**
 * Find the index a dragged item would be dropped at for a pointer height: the number of rows whose
 * middle lies above the pointer.
 *
 * @param midpoints - Vertical middle of each row, in the order of the list
 * @param y - Vertical position of the pointer, in the same space as the midpoints
 * @returns The drop index, from 0 to the number of rows minus one
 */
export function indexAtPoint(midpoints: readonly number[], y: number): number {
    if (midpoints.length === 0) return 0;

    const above = midpoints.filter((middle) => middle < y).length;
    return Math.min(above, midpoints.length - 1);
}
