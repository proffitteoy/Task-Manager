export async function getServerSideProps() {
  return {
    redirect: {
      destination: "/#music",
      permanent: false,
    },
  };
}

export default function MusicRedirect() {
  return null;
}
