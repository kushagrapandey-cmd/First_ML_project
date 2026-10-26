import os
import unittest
from unittest.mock import patch
from api.recommend import rank, recommend, CATALOG, TOPICS, seconds, live_candidates, CACHE, SearchUnavailable

class RetrievalTests(unittest.TestCase):
    def test_every_topic_has_a_unique_shortlist(self):
        for topic in TOPICS:
            if topic == 'custom': continue
            result = recommend({'topic':topic,'source':'catalogue'})
            self.assertEqual(len(result['videos']),5,topic)
            self.assertEqual(len({v['id'] for v in result['videos']}),5)
            self.assertTrue(all(v['topic']==topic for v in result['videos']))
    def test_language_is_enforced(self):
        result=recommend({'topic':'python','language':'hi','source':'catalogue'})
        self.assertTrue(result['videos'])
        self.assertTrue(all(v['language']=='hi' for v in result['videos']))
    def test_empty_language_is_honest(self):
        self.assertEqual(recommend({'topic':'linux','language':'hi','source':'catalogue'})['videos'],[])
    def test_invalid_input(self):
        for params in [{'topic':'bad'},{'language':'fr'},{'source':'other'},{'goal':'x'*121},{'length':'bad'}]:
            with self.assertRaises(ValueError): recommend(params)
    def test_duplicate_ids_are_removed(self):
        row=CATALOG[0]
        self.assertEqual(len(rank([row,row],'python')),1)
    def test_invalid_ids_are_removed(self):
        self.assertEqual(rank([{**CATALOG[0],'id':'<script>'}],'python'),[])
    def test_no_text_overlap_returns_empty(self):
        self.assertEqual(rank(CATALOG,'zxqvft'),[])
    def test_actual_query_changes_order(self):
        rows=[dict(id='AAAAAAAAAAA',title='Python functions functions',channel='A'),dict(id='BBBBBBBBBBB',title='Python classes classes',channel='B')]
        self.assertEqual(rank(rows,'functions')[0]['id'],'AAAAAAAAAAA')
        self.assertEqual(rank(rows,'classes')[0]['id'],'BBBBBBBBBBB')
    def test_cosine_bounded(self):
        self.assertTrue(all(0<=v['similarity']<=1 for v in rank(CATALOG,'python programming')))
    def test_missing_live_key_reports_error(self):
        with patch.dict(os.environ,{},clear=True):
            with self.assertRaisesRegex(SearchUnavailable,'not configured'):
                recommend({'source':'live'})
    def test_provider_failure_falls_back_explicitly(self):
        with patch.dict(os.environ,{'YOUTUBE_API_KEY':'test'}),patch('api.recommend.live_candidates',side_effect=TimeoutError):
            r=recommend({})
            self.assertEqual(r['source'],'catalogue')
            self.assertIn('unavailable',r['notice'])
    def test_live_success_uses_actual_metadata(self):
        row={**CATALOG[0],'duration':600,'source':'youtube'}
        with patch.dict(os.environ,{'YOUTUBE_API_KEY':'test'}),patch('api.recommend.live_candidates',return_value=[row]):
            r=recommend({'length':'short'})
            self.assertEqual(r['source'],'youtube')
            self.assertEqual(r['videos'][0]['duration'],600)
    def test_unknown_durations_do_not_satisfy_length_filters(self):
        row={**CATALOG[0],'duration':None}
        with patch('api.recommend.CATALOG',[row]):
            self.assertEqual(recommend({'source':'catalogue','length':'short'})['videos'],[])
    def test_iso_duration(self):
        self.assertEqual(seconds('PT1H2M3S'),3723)
        self.assertIsNone(seconds('invalid'))
    def test_metadata_verified_and_ids_unique(self):
        self.assertEqual(len(CATALOG),len({v['id'] for v in CATALOG}))
        self.assertTrue(all(v.get('metadataCheckedAt') for v in CATALOG))
    def test_language_unknown_excluded_and_cache_reused(self):
        CACHE.clear()
        result={'items':[{'id':{'videoId':'AAAAAAAAAAA'}}]}
        details={'items':[{'id':'AAAAAAAAAAA','status':{'embeddable':True,'privacyStatus':'public'},'snippet':{'title':'Python functions','channelTitle':'Teacher'},'contentDetails':{'duration':'PT10M'}}]}
        with patch('api.recommend.youtube_get',side_effect=[result,details]) as get:
            self.assertEqual(live_candidates('python','hi','test'),[])
            self.assertEqual(live_candidates('python','hi','test'),[])
            self.assertEqual(get.call_count,2)
        CACHE.clear()
    def test_failed_provider_is_negative_cached(self):
        CACHE.clear()
        with patch('api.recommend.youtube_get',side_effect=TimeoutError) as get:
            for _ in range(2):
                with self.assertRaises(Exception):live_candidates('python','any','test')
            self.assertEqual(get.call_count,1)
        CACHE.clear()

class GoalRegressionTests(unittest.TestCase):
    def test_unsupported_goal_never_repeats_generic_courses(self):
        result = recommend({'topic':'python','goal':'Kubernetes networking','source':'catalogue'})
        self.assertEqual(result['videos'], [])
    def test_specific_goal_filters_before_ranking(self):
        rows=[dict(id='AAAAAAAAAAA',title='Python decorators',topic='python',language='en',channel='A'),dict(id='BBBBBBBBBBB',title='Python loops',topic='python',language='en',channel='B')]
        with patch('api.recommend.CATALOG',rows):
            self.assertEqual([v['id'] for v in recommend({'topic':'python','goal':'decorators','source':'catalogue'})['videos']],['AAAAAAAAAAA'])
    def test_live_search_query_and_cache_include_goal(self):
        CACHE.clear()
        with patch('api.recommend.youtube_get',return_value={'items':[]}) as get:
            live_candidates('python','any','test','decorators')
            live_candidates('python','any','test','loops')
            live_candidates('python','any','test','decorators')
            self.assertEqual(get.call_count,2)
            self.assertIn('decorators',get.call_args_list[0].args[1]['q'])
            self.assertIn('loops',get.call_args_list[1].args[1]['q'])
        CACHE.clear()
    def test_custom_topic_requires_question(self):
        with self.assertRaises(ValueError): recommend({'topic':'custom'})
    def test_explicit_live_failure_does_not_silently_change_source(self):
        with patch.dict(os.environ,{'YOUTUBE_API_KEY':'test'}),patch('api.recommend.live_candidates',side_effect=TimeoutError):
            with self.assertRaises(SearchUnavailable):recommend({'source':'live'})

if __name__=='__main__':unittest.main()
