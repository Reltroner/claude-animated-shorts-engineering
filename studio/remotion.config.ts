// CLI defaults for `remotion studio` and `remotion render`. studio/scripts/render-p3.mjs passes the same values.
import { Config } from '@remotion/cli/config';

Config.setEntryPoint('src/index.ts');
Config.setVideoImageFormat('png');
Config.setCodec('h264');
Config.setCrf(16);
Config.setPixelFormat('yuv420p');
// Software GL: byte-reproducible and independent of the GPU driver. See scripts/render-p3.mjs for the measurements.
Config.setChromiumOpenGlRenderer('swangle');
Config.setOverwriteOutput(true);
