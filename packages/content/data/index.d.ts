export interface Item {
    id: string;
    name: string;
    stackable: boolean;
    value: number;
    [key: string]: any;
}

export interface Recipe {
    id: string;
    inputs: Array<{ itemId: string; qty: number }>;
    outputs: Array<{ itemId: string; qty: number }>;
    [key: string]: any;
}

export const itemsById: Record<string, Item>;
export const enemiesById: Record<string, any>;
export const locationsById: Record<string, any>;
export const recipesById: Record<string, Recipe>;
export const questTemplatesById: Record<string, any>;

declare const _default: {
    itemsById: typeof itemsById;
    enemiesById: typeof enemiesById;
    locationsById: typeof locationsById;
    recipesById: typeof recipesById;
    questTemplatesById: typeof questTemplatesById;
};

export default _default;
