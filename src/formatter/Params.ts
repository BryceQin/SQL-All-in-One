export type ParamItems = Record<string, string>;

/**
 * 基于给定参数处理替换占位符
 */
export default class Params {
    private params: ParamItems | string[] | undefined;
    private index: number;

    constructor(params: ParamItems | string[] | undefined) {
        this.params = params;
        this.index = 0;
    }

    /**
     * 用于根据占位符的「命名键」或「默认位置」，获取对应的具体参数值，未匹配到参数时返回占位符原始文本
     */
    public get({ key, text }: { key?: string; text: string }): string {
        // 场景1：无参数传入（this.params 为 undefined），直接返回原始占位符文本
        if (!this.params) {
            return text;
        }

        // 场景2：有 key（命名参数），按 key 从键值对中取值
        if (key) {
            return (this.params as ParamItems)[key];
        }
        // 场景3：无 key（位置参数），按当前 index 从数组中取值，之后 index 自增
        return (this.params as string[])[this.index++];
    }

    /**
     * 返回位置参数当前索引.
     */
    public getPositionalParameterIndex(): number {
        return this.index;
    }

    /**
     * 修改位置参数当前索引.
     */
    public setPositionalParameterIndex(i: number) {
        this.index = i;
    }
}
