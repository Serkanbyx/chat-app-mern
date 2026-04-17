import { useParams } from 'react-router-dom';

import PagePlaceholder from '../../components/common/PagePlaceholder.jsx';

const ChatPage = () => {
  const { conversationId } = useParams();
  return (
    <PagePlaceholder
      title="Conversation"
      description={`The message window for ${conversationId} is implemented in Step 27.`}
    />
  );
};

export default ChatPage;
