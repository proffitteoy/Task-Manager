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

export default function WorkstationPage() {
  return (
    <>
      <Head>
        <title>科研开发工作站</title>
      </Head>
      <WorkstationDashboard />
    </>
  );
}
