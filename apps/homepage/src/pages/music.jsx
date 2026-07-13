import { serverSideTranslations } from "next-i18next/pages/serverSideTranslations";
import Head from "next/head";

import WorkstationMusicPage from "components/workstation/music-page";

export async function getStaticProps() {
  return {
    props: {
      ...(await serverSideTranslations("zh-Hans")),
    },
  };
}

export default function MusicPage() {
  return (
    <>
      <Head>
        <title>音乐页 | 科研开发工作站</title>
        <meta name="description" content="Mineradio 风格的音乐页，播放列表来自工作站设置中的歌曲 ID。" />
      </Head>
      <WorkstationMusicPage />
    </>
  );
}
