import { useParams } from 'react-router-dom';

import PagePlaceholder from '../../components/common/PagePlaceholder.jsx';

const AdminUserDetail = () => {
  const { id } = useParams();
  return (
    <PagePlaceholder
      title="User detail"
      description={`Detail view for user ${id} is implemented in Step 33.`}
    />
  );
};

export default AdminUserDetail;
