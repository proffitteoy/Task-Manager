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
        <title>科研开发工作站</title>
        <meta
          name="description"
          content="本地优先的科研开发全流程记录工作站，统一管理任务、分板块计时、开发统计、电脑资源、音乐与复盘。"
        />
      </Head>
      <WorkstationDashboard />
    </>
  );
}
