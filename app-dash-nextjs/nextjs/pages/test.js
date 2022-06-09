import * as React from 'react';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Link from '../src/Link.js';
import ProductCard from '../src/ProductCard.js';


export async function getServerSideProps(context) {
  return {
    props: { data: [
      { name: 'Madonna', description: 'And you will know us by the trail of dead' },{ name: 'p2' },{ name: 'p3' },
      { name: 'Mistake and regrets', description: 'And you will know us by the trail of dead' },{ name: 'In Rainbows', description: 'Radiohead' },{ name: 'p5' }
    ]}, // will be passed to the page component as props
  }
}

export default function Test(props) {
    return (
      <Container maxWidth="sm">
        <Box sx={{ my: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Next.js example
          </Typography>
          <Button variant="contained" component={Link} noLinkStyle href="/">
            Go to the main page
          </Button>
        </Box>
        <p>{ JSON.stringify(props, true) }</p>
        <Grid container spacing={4}>
        {
            props.data.map( (_product) => 
              <ProductCard name={ _product.name} description={_product.description||'Mac Miller'}><p>{JSON.stringify(_product, true)}</p></ProductCard>
            )
        }
          </Grid>
      </Container>
    );
  }