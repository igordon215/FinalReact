import { useState, useEffect, useCallback, useRef } from 'react';
import { getChannels, getMessages, getMessagesByChannel, postMessage, getUserProfile, getPublicChannels, getPrivateChannelsByUsername, createPrivateChannel, createPublicChannel, checkUserExists } from '../services/api';
import { getCurrentUser } from '../services/auth';

// Custom hook to manage the application's data
function useAppData(isLoggedIn) {
  // State variables
  const [publicChannels, setPublicChannels] = useState([]); // Public channels
  const [privateChannels, setPrivateChannels] = useState([]); // Private channels
  const [channels, setChannels] = useState([]); // All channels (might be unused)
  const [messages, setMessages] = useState([]); // Messages in the current channel
  const [selectedChannelId, setSelectedChannelId] = useState(null); // Currently selected channel
  const [userProfile, setUserProfile] = useState(null); // User profile information
  const [loading, setLoading] = useState(false); // Loading state for async operations
  const [error, setError] = useState(null); // Error state for async operations

  // Refs
  const timer = useRef(null);
  const currentMessages = useRef([]);

  // Fetch all channels (might be unused)
  const fetchChannels = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      setLoading(true);
      const channelsData = await getChannels();
      setChannels(channelsData);
    } catch (err) {
      setError('Failed to fetch channels: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  // Fetch all public channels
  const fetchPublicChannels = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      setLoading(true);
      const publicChannelsData = await getPublicChannels();
      setPublicChannels(publicChannelsData);
    } catch (err) {
      setError('Failed to fetch public channels: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  // Fetch private channels for a specific user
  const fetchPrivateChannels = useCallback(async (username) => {
    if (!isLoggedIn) return;
    try {
      setLoading(true);
      const privateChannelsData = await getPrivateChannelsByUsername(username);
      setPrivateChannels(privateChannelsData);
    } catch (err) {
      setError('Failed to fetch private channels: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  // Fetch messages for a specific channel or all messages
  const fetchMessages = useCallback(async (channelId = null) => {
    if (!isLoggedIn) return;
    try {
      let messagesData;
      if (channelId) {
        messagesData = await getMessagesByChannel(channelId);
      } else {
        messagesData = await getMessages();
      }
      
      // Update messages regardless of the number of messages
      currentMessages.current = messagesData;
      setMessages(messagesData);
      setError(null);
    } catch (err) {
      setError('Failed to fetch messages: ' + err.message);
    }
  }, [isLoggedIn]);

  // Fetch user profile
  const fetchUserProfile = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const profileData = await getUserProfile();
      setUserProfile(profileData);
    } catch (err) {
      setError('Failed to fetch user profile: ' + err.message);
    }
  }, [isLoggedIn]);

// Create a new private channel
const createNewPrivateChannel = useCallback(async (invitedUsername) => {
 console.log('createNewPrivateChannel called with:', invitedUsername);
 if (!isLoggedIn) return;
 try {
   setLoading(true);
   const currentUser = getCurrentUser();
   if (!currentUser || !currentUser.username) {
     console.error('No current user found');
     throw new Error('No current user found');
   }

   console.log('Checking if user exists:', invitedUsername);
   // Check if the invited user exists
   const userExists = await checkUserExists(invitedUsername);
   console.log('User exists:', userExists);

   if (!userExists) {
     console.log('User does not exist, throwing error');
     const error = new Error(`User ${invitedUsername} does not exist.`);
     error.status = 404;
     throw error;
   }

   console.log('Creating private channel');
   const newChannel = await createPrivateChannel(currentUser.username, invitedUsername);
   
   // Set the channel name to be the invited user's username
   const channelWithName = {
     ...newChannel,
     name: invitedUsername
   };
   
   console.log('New channel created:', channelWithName);
   setPrivateChannels(prevChannels => [...prevChannels, channelWithName]);
   return channelWithName;
 } catch (err) {
   console.error('Error in createNewPrivateChannel:', err);
   if (err.status === 404) {
     throw err; // Rethrow 404 error to be caught in Messages component
   }
   setError('Failed to create private channel: ' + err.message);
   return null;
 } finally {
   setLoading(false);
 }
}, [isLoggedIn]);

// Create a new public channel
const createNewPublicChannel = useCallback(async (channelName) => {
 if (!isLoggedIn) return;
 try {
   setLoading(true);
   const currentUser = getCurrentUser();
   if (!currentUser || !currentUser.username) {
     throw new Error('No current user found');
   }

   const newChannel = await createPublicChannel(currentUser.username, channelName);
   
   setPublicChannels(prevChannels => [...prevChannels, newChannel]);
   return newChannel;
 } catch (err) {
   setError('Failed to create public channel: ' + err.message);
   return null;
 } finally {
   setLoading(false);
 }
}, [isLoggedIn]);

// Function to select a channel
const selectChannel = (channelId) => {
 setSelectedChannelId(channelId);
};

// Function to send a message
const sendMessage = async (content, channelId = null) => {
 if (!isLoggedIn) return;
 try {
   const actualChannelId = channelId || selectedChannelId;
   if (!actualChannelId) {
     throw new Error('No channel selected');
   }
   const newMessage = await postMessage({ content, channelId: actualChannelId });
   
   // Update messages immediately for the sender
   setMessages(prevMessages => [...prevMessages, newMessage]);
   
   // Also update currentMessages ref
   currentMessages.current = [...currentMessages.current, newMessage];
 } catch (err) {
   setError('Failed to send message: ' + err.message);
 }
};

// Effect to fetch initial data when user logs in
useEffect(() => {
 if (isLoggedIn) {
   fetchChannels();
   fetchPublicChannels();
   fetchUserProfile();
   const currentUser = getCurrentUser();
   if (currentUser && currentUser.username) {
     fetchPrivateChannels(currentUser.username);
   }
 }
}, [isLoggedIn, fetchChannels, fetchPublicChannels, fetchUserProfile, fetchPrivateChannels]);

// Effect to start polling when a channel is selected
useEffect(() => {
 if (isLoggedIn && selectedChannelId) {
   // Initial fetch
   fetchMessages(selectedChannelId);

   // Start polling
   timer.current = setInterval(() => fetchMessages(selectedChannelId), 1000);

   // Cleanup function to clear the interval when the component unmounts or selectedChannelId changes
   return () => {
     if (timer.current) {
       clearInterval(timer.current);
       timer.current = null;
     }
   };
 }
}, [isLoggedIn, selectedChannelId, fetchMessages]);

  // Return the hook's API
  return { 
    channels, 
    publicChannels,
    privateChannels,
    messages, 
    userProfile,
    loading, 
    error, 
    setError, 
    selectChannel,
    selectedChannelId,
    setSelectedChannelId,
    sendMessage,
    fetchMessages,
    fetchPublicChannels,
    fetchPrivateChannels,
    createNewPrivateChannel,
    createNewPublicChannel
  };
}

export default useAppData;