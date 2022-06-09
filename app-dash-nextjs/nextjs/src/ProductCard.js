import * as React from 'react';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardMedia from '@mui/material/CardMedia';
import IconButton from '@mui/material/IconButton';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
/*
const useStyles = makeStyles((theme) => ({
  root: {
    display: 'flex',
  },
  details: {
    display: 'flex',
    flexDirection: 'column',
  },
  content: {
    flex: '1 0 auto',
  },
  cover: {
    width: 151,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    paddingLeft: theme.spacing(1),
    paddingBottom: theme.spacing(1),
  },
  playIcon: {
    height: 38,
    width: 38,
  },
}));
*/


export default function ProductCard(props) {
    //const classes = useStyles();
    //const theme = useTheme();
  
    return (
    <Card>
      <div>
        <CardContent>
          <Typography component="h5" variant="h5">
            {props.name||'Live From Space'}
          </Typography>
          <Typography variant="subtitle1" color="textSecondary">
            {props.description||'Not Mac Miller'}
          </Typography>
        </CardContent>
        <div>
        <IconButton>
            <PlayArrowIcon className="play icon" />
          </IconButton> 
          <IconButton>
            <SkipPreviousIcon />
          </IconButton> 
          <IconButton>
            <SkipNextIcon />
          </IconButton> 
          {/*<IconButton aria-label="previous">
            {theme.direction === 'rtl' ? <SkipNextIcon /> : <SkipPreviousIcon />}
          </IconButton>
          <IconButton aria-label="play/pause">
            <PlayArrowIcon className="play icon" />
          </IconButton>
          <IconButton aria-label="next">
            {theme.direction === 'rtl' ? <SkipPreviousIcon /> : <SkipNextIcon />}
    </IconButton>*/}
        </div>
      </div>
      <CardMedia
        className="cover"
        image="/static/images/cards/live-from-space.jpg"
        title="Live from space album cover"
      />
    </Card>
    );
}