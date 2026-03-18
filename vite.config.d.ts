declare const _default: {
    root: string;
    publicDir: string;
    plugins: (import("vite").Plugin<any> | import("vite").Plugin<any>[])[];
    build: {
        outDir: string;
        emptyOutDir: boolean;
    };
    resolve: {
        alias: {
            '@': string;
        };
    };
};
export default _default;
