import type {CapacitorConfig} from '@capacitor/cli'

const productionUrl='https://loop-membership-eight.vercel.app/?loop-connect=1'

const config:CapacitorConfig={
  appId:'com.grion.loop',
  appName:'LOOP 멤버십',
  webDir:'public',
  server:{url:productionUrl,cleartext:false,androidScheme:'https'},
}

export default config
