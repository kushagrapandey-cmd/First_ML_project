import streamlit as st
import pandas as pd
import pickle



def fetch_thumbnail(video_id):
    # link = videos['thumb'][video_id]
    # response = requests.get(" "+video_id.format(video_id))
    # data = response.json()
    # st.text(data)
    return video_id


st.title('YTGuide')


def recommend(OnSearch):
    video_index = videos[videos['OnSearching'] == OnSearch].index[0]
    distances = similarity[video_index]
    video_list = sorted(list(enumerate(distances)), reverse=True, key=lambda x: x[1])[1:6]
    recommended_channel = []
    channel_thumbnails = []
    video_links = []
    for i in video_list:
        video_id = videos.iloc[i[0]].thumb
        link_id = videos.iloc[i[0]].videoId
        # st.text(video_id)
        video_links.append(get_link(link_id))
        channel_thumbnails.append(fetch_thumbnail(video_id))
        recommended_channel.append(videos.iloc[i[0]].channelTitle)

    return recommended_channel, channel_thumbnails, video_links


def get_link(video_id):
    return "https://www.youtube.com/watch?v=" + video_id


video_dict = pickle.load(open('Ytvideoes2.pkl', 'rb'))
similarity = pickle.load(open('similarity.pkl', 'rb'))
similarity = pd.DataFrame(similarity)
# videos = pd.DataFrame(video_dict)
# video = set(videos['OnSearching'].values)
videos = pd.DataFrame(video_dict)
categories = set(videos['OnSearching'])
categories = pd.DataFrame(categories)
selected_category = st.selectbox(
    'Choose The Topic You Want Study',
    categories
)

if st.button('Recommended Channels'):
    names, thumbs, links = recommend(selected_category)
    col1, col2, col3, col4, col5 = st.columns(5)

    with col1:
        st.text(names[0])
        st.image(thumbs[0])
        text = '[Get_video]({Get_video})'.format(Get_video=links[0])
        st.markdown(text, unsafe_allow_html=True)

    with col2:
        st.text(names[1])
        st.image(thumbs[1])
        text = '[Get_video]({Get_video})'.format(Get_video=links[1])
        st.markdown(text, unsafe_allow_html=True)

    with col3:
        st.text(names[2])
        st.image(thumbs[2])
        text = '[Get_video]({Get_video})'.format(Get_video=links[2])
        st.markdown(text, unsafe_allow_html=True)

    with col4:
        st.text(names[3])
        st.image(thumbs[3])
        text = '[Get_video]({Get_video})'.format(Get_video=links[3])
        st.markdown(text, unsafe_allow_html=True)

    with col5:
        st.text(names[4])
        st.image(thumbs[4])
        text = '[Get_video]({Get_video})'.format(Get_video=links[4])
        st.markdown(text, unsafe_allow_html=True)

st.caption('Now remove all distractions and study here!!')

with st.sidebar:
    st.selectbox('What you want to search?', categories)
    st.text('TEAM:')
    st.text('Kushagra Pandey')
    st.text('Aryan Gupta')
    st.text('Harsh Mishra')
    st.text('Ayush Nishad')
    st.text('Guided by - Sir Chandan Verma')
    st.text('Liked our Work?')
    result = st.button('Like')
    total = 653
    if result:
        total = total + 1
    st.text(total)
