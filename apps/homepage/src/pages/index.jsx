import WorkstationDashboard from "components/workstation/dashboard";
import { serverSideTranslations } from "next-i18next/pages/serverSideTranslations";
import Head from "next/head";

export async function getStaticProps() {
  return {
    props: {
      ...(await serverSideTranslations("zh-Hans")),
    },
  };
}

export default function IndexPage() {
  return (
    <>
      <Head>
        <title>认知工作站</title>
        <meta
          name="description"
          content="基于 Homepage 的本地全流程工作站，整合任务、计时、ActivityWatch、Token、GitHub、音乐与复盘。"
        />
      </Head>
      <WorkstationDashboard />
    </>
  );
}
