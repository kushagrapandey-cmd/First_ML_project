import unittest
from unittest.mock import patch
from api.recommend import recommend
from lib import semantic
class SemanticTests(unittest.TestCase):
    @unittest.skipUnless(semantic.available(),'Pinned ONNX assets are required for semantic integration tests')
    def test_hindi_meaning_matches_sql_without_sql_keyword(self):
        result=recommend({'topic':'custom','goal':'दो तालिकाओं को जोड़ना','source':'catalogue'})
        self.assertEqual(result['ranking'],'hybrid');self.assertEqual(result['videos'][0]['topic'],'sql')
        self.assertEqual(result['semanticModel'],semantic.MODEL_ID)
    @unittest.skipUnless(semantic.available(),'Pinned ONNX assets are required')
    def test_hindi_technology_name_is_respected(self):
        result=recommend({'topic':'custom','goal':'पायथन सीखना है','source':'catalogue'})
        self.assertTrue(result['videos']);self.assertEqual(result['videos'][0]['topic'],'python')
    @unittest.skipUnless(semantic.available(),'Pinned ONNX assets are required')
    def test_explicit_technology_prevents_cross_subject_results(self):
        result=recommend({'topic':'custom','goal':'kubernetes networking','source':'catalogue'})
        self.assertTrue(result['videos']);self.assertTrue(all('kubernetes' in (v['title']+' '+v.get('tags','')).lower() for v in result['videos']))
    def test_missing_model_has_labelled_keyword_fallback(self):
        with patch('api.recommend.semantic.available',return_value=False):
            result=recommend({'topic':'python','source':'catalogue'})
            self.assertEqual(result['ranking'],'lexical');self.assertIsNone(result['semanticModel']);self.assertIn('unavailable',result['notice'])
    def test_inference_failure_cannot_substitute_a_generic_subject_match(self):
        with patch('api.recommend.semantic.available',return_value=True),patch('api.recommend.semantic.rank',side_effect=RuntimeError):
            result=recommend({'topic':'python','goal':'python zzmissingconcept','source':'catalogue'})
            self.assertEqual(result['videos'],[]);self.assertEqual(result['ranking'],'lexical-fallback')
    def test_unknown_ranking_is_rejected(self):
        with self.assertRaises(ValueError):recommend({'ranking':'unknown'})
