import { useParams } from 'react-router-dom';

import PagePlaceholder from '../../components/common/PagePlaceholder.jsx';

const ProfilePage = () => {
  const { username } = useParams();
  return (
    <PagePlaceholder
      title={`@${username ?? 'user'}`}
      description="The public profile page is implemented in Step 31."
    />
  );
};

export default ProfilePage;
